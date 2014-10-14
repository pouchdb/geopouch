var Promise = require('lie');
var RTree = require('async-rtree');
var calculatebounds = require('geojson-bounding-volume');
var createView = require('./create-view');
var Store = require('./store');
var upsert = require('./upsert');

exports.spatial = function (fun, bbox, opts, cb) {
  if (bbox.length === 4) {
    bbox = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
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
    return createView(db, viewName, temporary, fun).then(function (viewDB) {
      viewDB = viewDB.db;
      if (viewDB._rStore) {
        store = viewDB._rStore;
      } else {
        store = viewDB._rStore = new RTree(new Store(viewDB));
      }

      function addDoc(doc) {
        var fulfill;
        var promise = new Promise(function (f) {
          fulfill = f;
        });
        var id = doc._id;
        var emited = false;
        function emit(doc) {
          emited = true;
          fulfill(store.insert(id, calculatebounds(doc)));
        }
        func(doc, emit);
        if (!emited) {
          fulfill();
        }
        return promise;
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
    });
  }).then(function () {
    return store.query(bbox, true);
  }).then(function (resp) {
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