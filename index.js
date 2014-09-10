var Promise = require('lie');
var RTree = reqire('async-rtree');
var calculatebounds = require('geojson-bounding-volume');
//var createView = require('./create-view');
//var Store = require('./store');


exorts.spatial = function (fun, bbox, cb) {
  var db = this;
  var opts = {
    db: db,
    viewName: 'temp',
    map: fun,
    temporary: true
  };
  var func = new Function ('doc', 'emit', 'var func = (' + fun.toString().replace(/;\s*$/,"") + ');func(doc);');
  var store = new RTree();
  function addDoc(doc) {
    var i = 0;
    var promise = Promise.resolve(true);
    var id = doc._id;
    function emit(doc) {
      var next = store.insert(id, calculatebounds(doc));
      promise = promise.then(function () {
        return next;
      });
    }
    func(doc, emit);
    return promise;
  }
  return db.allDocs({includeDocs: true}).then(function (res) {
    return Promise.all(res.rows.map(function (doc) {
      return addDoc(doc);
    })).then(function () {
      return store.query(bbox, cb);
    }, cb);
  });
};