
var Pouch = require('pouchdb');
var Spatial = require('../');
Pouch.plugin(Spatial);
var should = require('chai').should();
var towns = require('./towns.json');
var memdown = require('memdown');
describe('Spatial', function () {

  it ('should work', function (done) {
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.bulkDocs(towns.features.map(function (doc) {
      doc._id = doc.properties.TOWN;
      return doc;
    })).then(function () {
      return db.spatial(function (doc) {
        emit(doc.geometry);
      },[[ -70.98495,42.24867], [-70.98495,42.24867]]).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['BOSTON', 'QUINCY'], 'boston and quincy');
        done();
      });
    }).catch(done);
  });
  it ('should work with doc', function (done) {
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.put({
      _id: '_design/foo',
      spatial: {
        bar: function (doc) {
          emit(doc.geometry);
        }.toString()
      }
    }).then(function () {
      return db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      })).then(function () {
        return db.get('EASTHAMPTON').then(function (doc) {
          return db.remove(doc);
        });
      });
    }).then(function () {
      return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['BOSTON', 'QUINCY'], 'boston and quincy');
        done();
      });
    }).catch(done);
  });
  it ('should work with doc and stale true', function (done) {
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.put({
      _id: '_design/foo',
      spatial: {
        bar: function (doc) {
          emit(doc.geometry);
        }.toString()
      }
    }).then(function () {
      return db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      }));
    }).then(function () {
      return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867], {stale: true}).then(function (resp) {
        resp.length.should.equal(0);
        done();
      }).catch(function (e) {
        console.log(e);
        done(e);
      });
    }).catch(done);
  });
  it ('should work with a doc and include doc: true', function (done) {
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.put({
      _id: '_design/foo',
      spatial: {
        bar: function (doc) {
          emit(doc.geometry);
        }.toString()
      }
    }).then(function () {
      return db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      })).then(function () {
        return db.get('EASTHAMPTON').then(function (doc) {
          return db.remove(doc);
        });
      });
    }).then(function () {
      return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867], {include_docs: true}).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.doc._id;
        });
        nr.sort();
        nr.should.deep.equal(['BOSTON', 'QUINCY'], 'boston and quincy');
        done();
      });
    }).catch(done);
  });
  it ('should work with doc and delete', function (done) {
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.put({
      _id: '_design/foo',
      spatial: {
        bar: function (doc) {
          emit(doc.geometry);
        }.toString()
      }
    }).then(function () {
      return db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      }));
    }).then(function () {
      return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['BOSTON', 'QUINCY'], 'boston and quincy');
        return db.get('BOSTON').then(function (doc) {
          return db.remove(doc);
        });
      }).then(function () {
        return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
          resp.length.should.equal(1);
          var nr = resp.map(function(i) {
            return i.id;
          });
          nr.sort();
          nr.should.deep.equal(['QUINCY'], 'quincy');
          done();
        });
      });
    }).catch(done);
  });
  it ('should allow updating the query designDoc', function (done) {
      this.timeout(50000);
    var db = new Pouch('test' + Math.random(), {db: memdown});
    db.put({
      _id: '_design/foo',
      spatial: {
        bar: function (doc) {
          if (doc._id !== 'BOSTON') {
            emit(doc.geometry);
          }
        }.toString()
      }
    }).then(function () {
      return db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      })).then(function () {
        return db.get('EASTHAMPTON').then(function (doc) {
          return db.remove(doc);
        });
      });
    }).then(function () {
      return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
        resp.length.should.equal(1);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['QUINCY'], 'just quincy');
        return db.get('_design/foo');
      }).then(function (doc) {
        doc.spatial = {
          bar: function (doc) {
            if (doc._id !== 'QUINCY') {
              emit(doc.geometry);
            }
          }.toString()
        };
        return db.put(doc);
      }).then(function (r) {
        return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
          resp.length.should.equal(1);
          var nr = resp.map(function(i) {
            return i.id;
          });
          nr.sort();
          nr.should.deep.equal(['BOSTON'], 'just boston');
          done();
        });
      });
    }).catch(done);
  });
});