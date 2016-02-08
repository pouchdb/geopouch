var Promise = require('lie');
var RTree = require('async-rtree');
var calculatebounds = require('geojson-bounding-volume');
var createView = require('./create-view');
var Store = require('./store');
var upsert = require('./upsert');

exports.spatial = spatial;
function spatial(fun, bbox, opts, cb, /*only needed if people use 2 bboxen-->*/cb2) {
  if (bbox.length === 4) {
    bbox = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
  }
  if (Array.isArray(opts)) {
    bbox = [bbox, opts];
    opts = cb;
    cb = cb2;
  }
  var db = this;
  var viewName, temporary;

  if (!opts || typeof opts !== 'object') {
    cb = opts;
    opts = {};
  }
  var store, rawStore;
  var viewID;
  return makeFunc(db, fun).then(function (func) {
    if (typeof fun === 'function') {
      viewName = 'temporary';
      temporary = true;
    } else {
      viewName = func;
      viewID = '_design/' + fun.split('/')[0];
    }
    var view = createView(db, viewName, temporary, fun);
    var updated = view.then(updateIndex(func));
    if (opts.stale !== true) {
      return updated;
    } else {
      return view;
    }
  }).then(queryIndex).then(function (resp) {
    if (cb) {
      return cb(null, resp);
    } else {
      return resp;
    }
  }, function (err) {
    if (cb) {
      return cb(err);
    } else {
      throw err;
    }
  });

  function updateIndex(func) {
    return function (viewDB) {
      //console.log(viewDB);
      viewDB = viewDB.db;
      if (temporary) {
        store = new RTree();
      } else if (viewDB._rStore) {
        store = viewDB._rStore;
      } else {
        store = viewDB._rStore = new RTree(new Store(viewDB));
      }

      function addDoc(doc) {
        var id = doc._id;
        var emited = [];
        var i = 0;
        function emit(doc) {
          if (i++) {
            emited.push(store.append(id, calculatebounds(doc)));
          } else {
            emited.push(store.insert(id, calculatebounds(doc)));
          }
        }
        function fixMulti (doc) {
          var type = doc.type;
          switch (type) {
          case 'MultiPoint':
            return doc.coordinates.forEach(function (coord) {
              emit({
                type: 'Point',
                coordinates: coord
              });
            });
          case 'MultiLineString':
            return doc.coordinates.forEach(function (coord) {
              emit({
                type: 'LineString',
                coordinates: coord
              });
            });
          case 'MultiPolygon':
            return doc.coordinates.forEach(function (coord) {
              emit({
                type: 'Polygon',
                coordinates: coord
              });
            });
          case 'GeometryCollection':
            return doc.geometries.forEach(fixMulti);
          default:
            return emit(doc);
          }
        }
        func(doc, fixMulti);
        return Promise.all(emited);
      }
      var lastSeq;
      return viewDB.get('_local/gclastSeq').catch(function () {
        return {_id: '_local/gclastSeq', last_seq: 0};
      }).then(function (doc) {
        lastSeq = doc;
        return db.changes({
          include_docs: true,
          since: doc.last_seq
        });
      }).then(function (res) {
        if (!res.results) {
          return;
        }
        return Promise.all(res.results.filter(function (doc) {
          if (doc.id.indexOf('_design/') !== 0) {
            return true;
          }// } else if (doc.id === viewID) {
          //   return true;
          // }
        }).map(function (doc) {
          if (doc.deleted) {
            return store.remove(doc.id).catch(function () {
              // might not be in there
            });
          }
          return addDoc(doc.doc);
        })).then(function () {
          lastSeq.last_seq = res.last_seq;
          if (temporary) {
            return;
          }
          return upsert(viewDB, '_local/gclastSeq', function (doc) {
            if (!doc.last_seq) {
              return lastSeq;
            } else {
              doc.last_seq = Math.max(doc.last_seq, lastSeq.last_seq);
              return doc;
            }
          });
        });
      });
    };
  }
  function queryIndex() {
    return new Promise(function (resolve, reject) {
      var out = {};
      var promises = [];
      store.query(bbox).on('data', function (d) {
        if (d.id in out) {
          out[d.id].bboxen.push(d.bbox);
        } else {
          if (opts.include_docs) {
            promises.push(db.get(d.id).then(function (doc) {
              out[d.id].doc = doc;
            }));
          }
          out[d.id] = {
            id: d.id,
            bboxen: [d.bbox]
          };
        }
      }).on('error', reject).on('end', function () {
        resolve(Promise.all(promises).then(function () {
          return Object.keys(out).map(function (id) {
            return out[id];
          });
        }));
      });
    });
  }
}
function makeFunc (db, fun) {
  return new Promise (function (resolve, reject) {
    if (typeof fun === 'function') {
      return resolve(new Function ('doc', 'emit', 'var func = (' + fun.toString().replace(/;\s*$/,'') + ');func(doc);'));
    }
    var parts = fun.split('/');
    resolve(db.get('_design/' + parts[0]).then(function (doc) {
      var fun = doc.spatial[parts[1]];
      return new Function ('doc', 'emit', 'var func = (' + fun.replace(/;\s*$/,'') + ');func(doc);');
    }));
  });
}
