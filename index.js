var Promise = require('bluebird');
var RTree = require('async-rtree');
var calculatebounds = require('geojson-bounding-volume');
var createView = require('./create-view');
var Store = require('./store');
var upsert = require('./upsert');

exports.spatial = function (fun, bbox, cb) {
  if (bbox.length === 4) {
    bbox = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
  }
  var db = this;
  var viewName, temporary;
  if (typeof fun === 'function') {
    viewName = 'temporary/temporary';
    temporary = true;
  } else {
    viewName = fun;
  }
  var store;
  return createView(db, viewName, temporary).then(function (viewDB) {
    
    rawStore = new Store(viewDB.db);
    store = new RTree(rawStore);
    function delDoc(id) {
      return new Promise(function (fullfill, reject) {
        rawStore.get(key, function (err, bbox) {
          if (err) {
            reject(err);
          } else {
            fullfill(bbox);
          }
        });
      }).then(function (bbox) {
        return Promise.all([
            new Promise(function (fullfill, reject) {
              rawStore.del(key, bbox, function (err) {
                if (err) {
                  reject(err);
                } else {
                  fullfill();
                }
              });
            }),
            store.remove(key, bbox)
        ]);
      }, function () {
        // no big deal, no need to delete it
      });
    }
    function insertOrUpdate(key, newBBox) {
      return new Promise(function (fullfill, reject) {
        rawStore.get(key, function (err, bbox) {
          if (err) {
            reject(err);
          } else {
            fullfill(bbox);
          }
        });
      }).then(function (bbox) {
        return store.remove(key, bbox);
      }, function () {
        //we can ignore errors here
      }).then(function () {
        return Promise.all([
          new Promise(function (fullfill, reject) {
            rawStore.put(key, newBBox, function (err) {
              if (err) {
                reject(err);
              } else {
                fullfill();
              }
            });
          }),
          store.insert(key, newBBox)
        ]);
      });
    }
    return makeFunc(db, fun).then(function (func) {
      function addDoc(doc) {
        var fulfill;
        var promise = new Promise(function (f) {
          fulfill = f;
        });
        var id = doc._id;
        function emit(doc) {
          fulfill(insertOrUpdate(id, calculatebounds(doc)));
        }
        func(doc, emit);
        return promise;
      }
      var lastSeq;
      return db.get('_local/gclastSeq').catch(function () {
        return {_id: '_local/gclastSeq', last_seq: 0};
      }).then(function (doc) {
        lastSeq = doc;
        return db.changes({
          include_docs: true,
          since: doc.last_seq
        });
      }).then(function (res) {
        return Promise.all(res.results.filter(function (doc) {
          if (doc.id.indexOf('_design/') !== 0) {
            return true;
          }
        }).map(function (doc) {
          if (doc.deleted) {
            return delDoc(doc.id);
          }
          return addDoc(doc.doc);
        })).then(function () {
          lastSeq.last_seq = res.last_seq;
          return upsert(db, '_local/gclastSeq', function (doc) {
            if (!doc.last_seq) {
              return lastSeq;
            } else {
              doc.last_seq = Math.max(doc.last_seq, lastSeq.last_seq);
              return doc;
            }
          });
        });
      });
    });
  }).then(function () {
    return store.query(bbox, true);
  }).nodeify(cb);
  
};

function makeFunc (db, fun) {
  return new Promise (function (resolve, reject) {
    if (typeof fun === 'function') {
      return resolve(new Function ('doc', 'emit', 'var func = (' + fun.toString().replace(/;\s*$/,"") + ');func(doc);'));
    }
    var parts = fun.split('/');
    resolve(db.get('_design/' + parts[0]).then(function (doc) {
      var fun = doc.spatial[parts[1]];
      return new Function ('doc', 'emit', 'var func = (' + fun.replace(/;\s*$/,"") + ');func(doc);');
    }));
  });
}