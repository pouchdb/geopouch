var Promise = require('bluebird');
var RTree = require('async-rtree');
var calculatebounds = require('geojson-bounding-volume');
var createView = require('./create-view');
var Store = require('./store');


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
  return createView(db, viewName, temporary).then(function (viewDB) {
    function has(key) {
      return viewDB.db.get(key).then(function () {
        return true;
      }, function () {
        return false;
      });
    }
    var store = new RTree(new Store(viewDB.db));
    return makeFunc(db, fun).then(function (func) {
      function addDoc(doc) {
        var i = 0;
        var fulfill;
        var promise = new Promise(function (f) {
          fulfill = f;
        });
        var id = doc._id;
        function emit(doc) {
          fulfill(store.insert(id, calculatebounds(doc)));
        }
        func(doc, emit);
        return promise;
      }
      return db.allDocs({include_docs: true}).then(function (res) {
        return Promise.all(res.rows.filter(function (doc) {
          if (!('deleted' in doc) && doc.id.indexOf('_design/') !== 0) {
            return true;
          }
        }).map(function (doc) {
          return addDoc(doc.doc);
        }));
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