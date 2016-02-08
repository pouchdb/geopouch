var Promise = require('lie');
module.exports = Store;
function Store(db) {
  this.db = db;
}
Store.prototype.get = function(key, cb) {
  this.db.get(key, function (err, doc) {
    if (err) {
      return cb(err);
    }
    cb(null, doc.value);
  });
};

Store.prototype.put = function(key, value, cb) {
  var self = this;
  this.db.get(key).catch(function () {
    return {_id: key};
  }).then(function (doc) {
    doc.value = value;
    return self.db.put(doc);
  }).then(function () {
    cb();
  }, cb);
};

Store.prototype.del = function(key, cb) {
  var self = this;
  this.db.get(key).then(function (doc) {
    return self.db.remove(doc);
  }).then(function (r) {
    cb();
  }, function (e) {
    cb(e);
  });
};
Store.prototype.batch = function(array, cb) {
  var self = this;
  return Promise.all(array.map(function (item) {
    return new Promise(function (resolve, reject) {
      function callback(err, value) {
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      }
      if (item.type === 'del') {
        return self.del(item.key, callback);
      }
      return self.put(item.key, item.value, callback);
    });
  })).then(function () {
    cb();
  }, cb);
};
