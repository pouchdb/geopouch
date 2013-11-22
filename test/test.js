
var Pouch = require('pouchdb');
var Spatial = require('../')
Pouch.plugin('Spatial',Spatial);
require('chai').should();
var denodify = require('lie-denodify');
var promise = require('lie');
var destroy = denodify(Pouch.destroy);
var create = denodify(Pouch);
describe('Spatial',function(){

  // some geometries are based on the GeoJSON specification
  // http://geojson.org/geojson-spec.html (2010-08-17)
  var GEOJSON_GEOMS = [
  { "type": "Point", "coordinates": [100.0, 0.0] },
  { "type": "LineString", "coordinates":[
  [100.0, 0.0], [101.0, 1.0]
  ]},
  { "type": "Polygon", "coordinates": [
  [ [100.0, 0.0], [101.0, 0.0], [100.0, 1.0], [100.0, 0.0] ]
  ]},
  { "type": "Polygon", "coordinates": [
  [ [100.0, 0.0], [101.0, 0.0], [100.0, 1.0], [100.0, 0.0] ],
  [ [100.2, 0.2], [100.6, 0.2], [100.2, 0.6], [100.2, 0.2] ]
  ]},
  { "type": "MultiPoint", "coordinates": [
  [100.0, 0.0], [101.0, 1.0]
  ]},
  { "type": "MultiLineString", "coordinates": [
  [ [100.0, 0.0], [101.0, 1.0] ],
  [ [102.0, 2.0], [103.0, 3.0] ]
  ]},
  { "type": "MultiPolygon", "coordinates": [
  [[[102.0, 2.0], [103.0, 2.0], [103.0, 3.0], [102.0, 3.0], [102.0, 2.0]]],
  [
  [[100.0, 0.0], [101.0, 0.0], [101.0, 1.0], [100.0, 1.0], [100.0, 0.0]],
  [[100.2, 0.2], [100.8, 0.2], [100.8, 0.8], [100.2, 0.8], [100.2, 0.2]]
  ]
  ]},
  { "type": "GeometryCollection", "geometries": [
  { "type": "Point", "coordinates": [100.0, 0.0] },
  { "type": "LineString", "coordinates": [ [101.0, 0.0], [102.0, 1.0] ]}
  ]}
  ];


  it("Test bounding box calculation", function() {
    var bbox = Spatial.calculateBbox(GEOJSON_GEOMS[0]);
    bbox.should.deep.equal([[100.0, 100.0], [0.0, 0.0]],
      "Bounding box of a Point");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[1]);
    bbox.should.deep.equal([[100.0, 101.0], [0.0, 1.0]],
      "Bounding box of a LineString");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[2]);
    bbox.should.deep.equal([[100.0, 101.0], [0.0, 1.0]],
      "Bounding box of a Polygon");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[3]);
    bbox.should.deep.equal([[100.0, 101.0], [0.0, 1.0]],
      "Bounding box of a Polygon with whole");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[4]);
    bbox.should.deep.equal([[100.0, 101.0], [0.0, 1.0]],
      "Bounding box of a MultiPoint");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[5]);
    bbox.should.deep.equal([[100.0, 103.0], [0.0, 3.0]],
      "Bounding box of a MultiLineString");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[6]);
    bbox.should.deep.equal([[100.0, 103.0], [0.0, 3.0]],
      "Bounding box of a MultiPolygon");

    bbox = Spatial.calculateBbox(GEOJSON_GEOMS[7]);
    bbox.should.deep.equal([[100.0, 102.0], [0.0, 1.0]],
      "Bounding box of a GeometryCollection");
  });

it("Test basic spatial view", function(done) {
  var designDoc = {
    _id: '_design/foo',
    spatial: {
      test: 'function(doc) {if (doc.key) {emit(doc.key, doc); }}'
    }
  };

  var docs = [
  designDoc,
  {foo: 'bar', key: [1]},
  {_id: 'volatile', foo: 'baz', key: [2]}
  ];
  function make(){
    return create('db_basic');
  };
  destroy('db_basic').then(make,make).then(function(db){
    db.bulkDocs({docs: docs}, {}, function() {
      db.get('volatile', function(_, doc) {
        db.remove(doc, function(_, resp) {
          db.spatial('foo/test', {start_range: [null], end_range: [null]}, function(_, res) {
            res.rows.length.should.equal( 1, 'Dont include deleted documents');
            res.rows.forEach(function(x, i) {
              x.should.be.an('object');
              x.key.should.be.ok;
              x.value._rev.should.be.ok;
              x.value._id.should.be.ok;
            });
            destroy('db_basic').then(done,done);
          });
        });
      });
    });
  });
});

it("Test opts.start_range/opts.end_range", function(done) {
  var designDoc = {
    _id: '_design/foo',
    spatial: {
      test: 'function(doc) {if (doc.key) {emit(doc.key, doc);}}'
    }
  };
  function make(){
    return create('TESTDB1');
  }
  destroy('TESTDB1').then(make,make).then(function(db){
    db.bulkDocs({docs: [designDoc, {key: [10, 100]},{key: [20, 200]},{key: [30, 300]},{key: [40, 400]},{key: [50, 500]}]}, {}, function() {
      db.spatial('foo/test', {start_range: [21, 301], end_range: [49, 1000]}, function(_, res) {
        res.rows.should.have.length(1, 'start_range/end_range query 1');
        db.spatial('foo/test', {start_range: [1, 201], end_range: [49, 401]}, function(_, res) {
          res.rows.should.have.length(2, 'start_range/end_range query 2');
          destroy('TESTDB1').then(done,done);
        });
      });
    });
  });
});

it("Basic tests from GeoCouch test suite", function(done) {
  var designDoc = {
    _id: '_design/geojson',
    spatial: {
      test: 'function(doc) {if (doc.geom) {emit(doc.geom, doc.geom.type);}}'
    }
  };
  function make(){
    return create('TESTDB2');
  };
  destroy('TESTDB2').then(make,make).then(function(db){
    var docs = GEOJSON_GEOMS.map(function(x, i) {
      return {_id: (i).toString(), geom: x};
    });
    docs.push(designDoc);
    var bulkDocs = denodify(db.bulkDocs);
    bulkDocs({docs: docs}, {}).then(function() {
      db.spatial('geojson/test').then(function(res) {
        res.rows.should.have.length(GEOJSON_GEOMS.length,
          "The same number of returned geometries is correct");

        res.rows.forEach(function(x, i) {
          var found = GEOJSON_GEOMS.filter(function(value) {
            if (JSON.stringify(x.geometry) === JSON.stringify(value)) {
              return true;
            }
          });
          found.should.have.length(1, "Geometry was found in the values");
        });
      }).then(function(){
        return destroy('TESTDB2');
      }).then(done,done);
    });
  });
});
describe("Range tests from GeoCouch test suite", function(){
  function tests_with_geometry (db) {
    return promise(function(success,failure){
      db.spatial('spatial/withGeometry', {include_docs:true,start_range: [-20, 0, 6.4], end_range: [16, 25, 8.7]}).then(function(res) {
        extract_ids(res).should.deep.equal(['2','3','4','5'],
          'should return a subset of the geometries');
      }).then(function(){
        return db.spatial('spatial/withGeometry', {conflicts:true,start_range: [-17, 0, 8.8], end_range: [16, 25, 8.8]}).then(function(res) {
          extract_ids(res).should.deep.equal(['4','5'],
            "should return a subset of the geometries " +
            "(3rd dimension is single point)");
        });
      }).then(function(){
        return db.spatial('spatial/withGeometry', {start_range: [-17, 0, null], end_range: [16, 25, null]}).then(function(res) {
            extract_ids(res).should.deep.equal(['10','2','3','4','5'],
              "should return a subset of the geometries " +
              "(3rd dimension is a wildcard)");
          });
        }).then(function(){    
          return db.spatial('spatial/withGeometry', {start_range: [-17, 0, null], end_range: [16, 25, 8.8]}).then(function(res) {
            extract_ids(res).should.deep.equal(['2','3','4','5'],
                "should return a subset of the geometries " +
                "(3rd dimension is open at the start)");
          });
        }).then(function(){
          return db.spatial('spatial/withGeometry', {start_range: [-17, 0, 8.8], end_range: [16, 25, null]}).then(function(res) {
            extract_ids(res).should.deep.equal(['10','4','5'],
                "should return a subset of the geometries " +
                "(3rd dimension is open at the end)");
          })
        }).then(success,failure);
    });
  };
function tests_with_3dgeometry (db) {
    return promise(function(success,failure){
      db.spatial('spatial/with3DGeometry', {start_range: [-20,-20,-20], end_range: [20, 25, 80.7]}).then(function(res) {
        extract_ids(res).should.deep.equal([ '0', '9', '10', '1', '2', '3', '4', '5', '6', '7', '8' ].sort(),
          'should return a subset of the geometries');
      }).then(function(){
        return db.spatial('spatial/with3DGeometry', {include_docs:true,start_range: [0, 0, 19], end_range: [20, 25, 20]}).then(function(res){
          extract_ids(res).should.deep.equal(['5','6'],
            "should return a subset of the geometries " +
            "(3rd dimension is single point)");
            });
        }).then(function(){
          return db.spatial('spatial/with3DGeometry',function(_,resp){
            extract_ids(res).should.deep.equal([ '0', '9', '10', '1', '2', '3', '4', '5', '6', '7', '8' ].sort(),
          'work on empty');
          }).then(function(){});
        }).then(success,failure);
        });
}
function tests_with_4dgeometry (db) {
    return promise(function(success,failure){
      db.spatial('spatial/with4DGeometry', {start_range: [-20,-20,-20,-20], end_range: [20, 25, 80.7,100]}).then(function(res) {
        extract_ids(res).should.deep.equal([ '0', '9', '10', '1', '2', '3', '4', '5', '6', '7', '8' ].sort(),
          'should return a subset of the geometries');
      }).then(function(){
        return db.spatial('spatial/with4DGeometry', {start_range: [0, 0, 19,25], end_range: [20, 25, 20,36]}).then(function(res){
          extract_ids(res).should.deep.equal(['5','6'],
            "should return a subset of the geometries");
            });
        }).then(function(){
        return db.spatial('spatial/with4DGeometry', {include_docs:true,start_range: [0, 0, 19,25], end_range: [20, 25, 20,36]}).then(function(res){
          extract_ids(res).should.deep.equal(['5','6'],
            "should return a subset of the geometries");
            });
        }).then(success,failure);
        });
}

function tests_without_geometry(db) {
  return promise(function(success,failure){
    db.spatial('spatial/noGeometry', {start_range: [3, 0, -10, 2], end_range: [10, 21, -9, 20]}).then(function(res) {
      extract_ids(res).should.deep.equal( ['2','3','4','5'],
        "should return a subset of the geometries");
    }).then(function(){
      return db.spatial('spatial/noGeometry', {start_range: [3, 0, -7, 5], end_range: [10, 21, -7, 20]}).then(function(res) {
        extract_ids(res).should.deep.equal(['5','6','7'],
          "should return a subset of the geometries" +
          "(3rd dimension is a point)");
      });
    }).then(function(){
      return db.spatial('spatial/noGeometry', {start_range: [3, null, -2, 4], end_range: [10, null, -2, 20]}).then(function(res) {
        extract_ids(res).should.deep.equal(['10','4','5','6','7','8','9'],
          "should return a subset of the geometries" +
          "(2nd dimension is a wildcard)");
        });
    }).then(function(){
      return db.spatial('spatial/noGeometry', {start_range: [3, null, -2, 4], end_range: [10, 15, -2, 20]}).then(function(res) {
            extract_ids(res).should.deep.equal(['4','5'],
              "should return a subset of the geometries" +
              "(2nd dimension is open at the start)");
            });
    }).then(function(){
      return db.spatial('spatial/noGeometry', {start_range: [3, 20, -2, 4], end_range: [10, null, -2, 20]}).then(function(res) {
              extract_ids(res).should.deep.equal(['10','7','8','9'],
                "should return a subset of the geometries" +
                "(2nd dimension is open at the end)");
            });
          }).then(success,failure);
        });
};
function extract_ids(response) {
  if (response.length === 0) {
    return [];
  }
  var result = response.rows.map(function(row) {
    return row.id;
  });
  result.sort();
  return result;
}
var db;
it("range tests 1", function(done) {
  var designDoc = {
    _id:"_design/spatial",
    language: "javascript",
    spatial: {
      withGeometry: function(doc) {
        emit([{
          type: "Point",
          coordinates: doc.loc
        }, [doc.integer, doc.integer+5]], {string:doc.string});
      }.toString(),
      with3DGeometry: function(doc) {
        emit({
          type: "Point",
          coordinates: [doc.integer, doc.integer+5, doc.integer+14]
        }, {_id:(doc._id+1)});
      }.toString(),
      with4DGeometry: function(doc) {
        emit({
          type: "Point",
          coordinates: [doc.integer, doc.integer+5, doc.integer+14,doc.integer*doc.integer]
        }, doc);
      }.toString(),
      noGeometry: function(doc) {
        emit([[doc.integer, doc.integer+1], doc.integer*3,
          [doc.integer-14, doc.integer+100], doc.integer],
          doc.string);
      }.toString()
    }
  };

  function makeSpatialDocs(start, end) {
    var docs = [];
    for (var i=start; i<end; i++) {
      var doc = {};
      doc._id = (i).toString();
      doc.integer = i;
      doc.string = (i).toString();
      doc.loc = [i-20+doc.integer, i+15+doc.integer];
      docs.push(doc);
    }
    return docs;
  }



  var docs = makeSpatialDocs(0, 10);
  docs.push(designDoc);
  docs.push({_id: '10', string: '10', integer: 10, loc: [1,1]});

  function make(){
    return create('TESTDB3');
  };

  destroy('TESTDB3').then(make,make).then(function(d){
    db = d;
    db.bulkDocs({docs: docs}, {}, function() {
      tests_with_geometry(db).then(done,done);
    });
  });
});
it('range tests 2',function(done){
  tests_without_geometry(db).then(done,done);

});
it('range tests 3',function(done){
  tests_with_3dgeometry(db).then(done,done);
});
  it('range tests 4',function(done){
  tests_with_4dgeometry(db).then(function(){
    return destroy('TESTDB3');
  }).then(done,done);
});

});
describe('errors',function(){
  it('should throw with a temp function',function(done){
    
    create('test4').then(function(db){
      return db.spatial(function(){});
    }).then(null,function(reason){
      reason.should.deep.equal({
          status: 400,
          error: 'invalid_request',
          reason: 'Querying with a function is not supported for Spatial Views'
        });
      return;
    }).then(function(a){
      return destroy('test4').then(function(){
        return a;
      });
    },function(a){
      return destroy('test4').then(function(){
        throw a;
      });
    }).then(done,done);
  });
});
});