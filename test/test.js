
var Pouch = require('pouchdb');
var Spatial = require('../');
Pouch.plugin(Spatial);
var should = require('chai').should();
var towns = require('./towns.json');
var memdown = require('memdown');
testit('level', {});
if (!process.browser) {
  testit('memory', {db: memdown});
}
function testit(name, opts) {
  describe('Spatial ' + name, function () {
    var db, db2;
    beforeEach(function (done) {
      db = new Pouch('testy', opts);
      done();
    });
    before(function (done) {
      db2 = new Pouch('testy2', opts);
      db2.bulkDocs([{
        _id: '_design/foo',
        spatial: {
          bar: function (doc) {
            emit(doc.geometry);
          }.toString()
        }
      }].concat(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      }))).then(function () {
        return db2.spatial('foo/bar',[[0,0], [0,0]]);
      }).then(function () {
        done();
      }, done);
    });
    after(function (done) {
      db2.destroy().then(function () {
        done();
      }, done);
    });
    afterEach(function (done) {
      db.destroy().then(function () {
        done();
      }, done);
    });
    it ('should work', function (done) {
      db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      })).then(function () {
        return db.spatial(function (doc) {
          emit(doc.geometry);
        },[[ -71.70639038085936,42.353469793490646], [-71.56219482421875, 42.461966608980134]]).then(function (resp) {
          resp.length.should.equal(9);
          var nr = resp.map(function(i) {
            return i.id;
          });
          nr.sort();
          nr.should.deep.equal([
            'BERLIN',
            'BOLTON',
            'BOYLSTON',
            'CLINTON',
            'HARVARD',
            'HUDSON',
            'LANCASTER',
            'MARLBOROUGH',
            'NORTHBOROUGH' ], 'names');
          done();
        });
      }).catch(done);
    });
    it ('should work with 2 array bbox format', function (done) {
      db.bulkDocs(towns.features.map(function (doc) {
        doc._id = doc.properties.TOWN;
        return doc;
      })).then(function () {
        db.spatial(function (doc) {
          emit(doc.geometry);
        },[ -70.98495,42.24867], [-70.98495,42.24867], function (err, resp) {
          if (err) {
            return done(err);
          }
          resp.length.should.equal(1);
          var nr = resp.map(function(i) {
            return i.id;
          });
          nr.sort();
          nr.should.deep.equal(['QUINCY'], 'quincy');
          done();
        });
      }).catch(done);
    });
    it ('should work with doc', function (done) {
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
        return db.spatial('foo/bar',[  -70.9610366821289,42.266638876842244, -70.94078063964844,42.293056273848215]);
      }).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['HULL', 'QUINCY'], 'quincy and hull');
        return db.spatial('foo/bar',[  -70.9610366821289,42.266638876842244, -70.94078063964844,42.293056273848215]);
      }).then(function(resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal(['HULL', 'QUINCY'], 'quincy and hull part deux');
      }).then(function () {
        done();
      }, done);
    });
    it ('should work with doc and stale true', function (done) {
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
        });
      }).catch(done);
    });
    it ('should work with a doc and include doc: true', function (done) {
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
          resp.length.should.equal(1);
          var nr = resp.map(function(i) {
            return i.doc._id;
          });
          nr.sort();
          nr.should.deep.equal(['QUINCY'], 'quincy');
          done();
        });
      }).catch(done);
    });
    it ('should work with doc and delete', function (done) {
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
          global.trace = true;
          resp.length.should.equal(1);
          var nr = resp.map(function(i) {
            return i.id;
          });
          nr.sort();
          nr.should.deep.equal(['QUINCY'], 'quincy');
          return db.get('QUINCY').then(function (doc) {
            return db.remove(doc);
          });
        }).then(function () {
          return db.spatial('foo/bar',[ -70.98495,42.24867, -70.98495,42.24867]).then(function (resp) {
            resp.length.should.equal(0);
            done();
          });
        });
      }).catch(done);
    });
    it ('should allow updating the query designDoc', function (done) {
      this.timeout(50000);
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
            resp.length.should.equal(0);
            done();
          });
        });
      }).catch(done);
    });

    it ('should work fast', function (done) {
      db2.spatial('foo/bar',[[ -71.70639038085936,42.353469793490646], [-71.56219482421875, 42.461966608980134]]).then(function (resp) {
        resp.length.should.equal(9);
        var nr = resp.map(function(i) {
          return i.id;
        });
        nr.sort();
        nr.should.deep.equal([
          'BERLIN',
          'BOLTON',
          'BOYLSTON',
          'CLINTON',
          'HARVARD',
          'HUDSON',
          'LANCASTER',
          'MARLBOROUGH',
          'NORTHBOROUGH' ], 'names');
        done();
      }).catch(done);
    });

    it('should be able to close and then open', function (done) {
      var db3;
      db.bulkDocs([{
        _id : 'eb46c0cc24eabb6427af7eac2b0012ac',
        geometry : {
          type : 'Point',
          coordinates : [13.3971420055456, 52.5296601136334]
        }
      }, {
        _id : 'eb46c0cc24eabb6427af7eac2b001c9f',
        geometry : {
          type : 'Point',
          coordinates : [13.6384082053328, 52.418740058446]
        }
      }])
      .then(function (){
        return db.spatial(function(doc){
          emit(doc.geometry);
        }, [[13.3971420055456,52.418740058446],[13.6384082053328,52.5296601136334]])
      })
      .then(function(resp){
        resp.length.should.equal(2);
        return db.close();
      })
      .then(function (){
        db3 = new Pouch('testy', opts);
        return db3.allDocs();
      }).then(function(resp){
        resp.rows.length.should.equal(2);
      }).then(function (){
        return db3.spatial(function(doc){
          emit(doc.geometry);
        }, [[13.3971420055456,52.418740058446],[13.6384082053328,52.5296601136334]])
      }).then(function (resp) {
        resp.length.should.equal(2);
        var nr = resp.map(function(i) {
          return i.id;
        });
        db = db3;
        done();
      })
      .catch(function (e){
        db = db3;
        done(e);
      });
    });
  });
}
