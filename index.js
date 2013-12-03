var promise = require('lie');
var denodify = require('lie-denodify');
var calculateBbox = require('geojson-bounding-volume');
// If we wanted to store incremental views we can do it here by listening
// to the changes feed (keeping track of our last update_seq between page loads)
// and storing the result of the map function (possibly using the upcoming
// extracted adapter functions)
var isArray = Array.isArray || function(obj) {
  return obj instanceof Array;
};

function normalizeKey(key) {
  var newKey = [];
  var geometry = null;

      // Whole key is one geometry
  if (!isArray(key) && typeof key === "object") {
    return {
      key: Spatial.calculateBbox(key),
      geometry: key
    };
  }

  if (!isArray(key[0]) && typeof key[0] === "object") {
    newKey = Spatial.calculateBbox(key[0]);
    geometry = key[0];
    key = key.slice(1);
  }

 for(var i=0; i<key.length; i++) {
    if(isArray(key[i])) {
        newKey.push(key[i]);
      // If only a single point, not a range was emitted
    } else {
      newKey.push([key[i], key[i]]);
    }
  }
  return {
    key: newKey,
    geometry: geometry
  };
};
function within(key, start_range, end_range) {
  var start;
  var end;
  for(var i=0; i<key.length; i++) {
    start = key[i][0];
    end = key[i][1];
    if (
      ((start_range[i] === null && (start <= end_range[i] || end_range[i] === null))
       // Start is set
        || (start <= end_range[i] || end_range[i] === null))
        &&
        // Wildcard at the end
       ((end_range[i] === null && (end >= start_range[i] || start_range[i] === null))
        // End is set
        || (end >= start_range[i] || start_range[i] === null))) {
        continue;
    } else {
      return false;
    }
  }
  return true;
};
function Spatial(db) {
  if(!(this instanceof Spatial)){
    return new Spatial(db);
  }
  var get = denodify(db.get);
  function viewQuery(fun, options) {
    return promise(function(success,failure){
      var results = [];
      var current = null;
      var num_started= 0;
      var completed= false;

      function emit(key, val) {
        var keyGeom = normalizeKey(key);
        var viewRow = {
          id: current.doc._id,
          key: keyGeom.key,
          value: val,
          geometry: keyGeom.geometry
        };

        // If no range is given, return everything
        if (options.start_range !== undefined &&
          options.end_range !== undefined) {
          if (!within(keyGeom.key, options.start_range, options.end_range)) {
            return;
          }
        }

        num_started++;
        if (options.include_docs) {
          //in this special case, join on _id (issue #106)
          if (val && typeof val === 'object' && val._id){
            get(val._id).then(function(joined_doc){
                  viewRow.doc = joined_doc;
            },function(){}).then(function(){
                results.push(viewRow);
                checkComplete();
              });
            return;
          } else {
            viewRow.doc = current.doc;
          }
        }
        results.push(viewRow);
      };

      // ugly way to make sure references to 'emit' in map/reduce bind to the
      // above emit
      eval('fun = ' + fun.toString() + ';');

      // exclude  _conflicts key by default
      // or to use options.conflicts if it's set when called by db.query
      var conflicts = ('conflicts' in options ? options.conflicts : false);

      // only proceed once all documents are mapped and joined
      function checkComplete() {
        if (completed && results.length == num_started){
          return success({rows: results});
        }
      }

      db.changes({
        conflicts: conflicts,
        include_docs: true,
        onChange: function(doc) {
          // Don't index deleted or design documents
          if (!('deleted' in doc) && doc.id.indexOf('_design/') !== 0) {
            current = {doc: doc.doc};
            fun.call(this, doc.doc);
          }
        },
        complete: function() {
          completed= true;
          checkComplete();
        }
      });
    });
  }

  function httpQuery(location, opts) {
    var request = denodify(db.request);
    // List of parameters to add to the PUT request
    var params = [];

    // TODO vmx 2013-01-27: Support skip and limit
    if (typeof opts.skip !== 'undefined') {
      params.push('skip=' + encodeURIComponent(JSON.stringify(
        opts.skip)));
    }
    if (typeof opts.limit !== 'undefined') {
      params.push('limit=' + encodeURIComponent(JSON.stringify(
        opts.limit)));
    }
    if (typeof opts.start_range !== 'undefined') {
      params.push('start_range=' + encodeURIComponent(JSON.stringify(
        opts.start_range)));
    }
    if (typeof opts.end_range !== 'undefined') {
      params.push('end_range=' + encodeURIComponent(JSON.stringify(
        opts.end_range)));
    }
    if (typeof opts.key !== 'undefined') {
      params.push('key=' + encodeURIComponent(JSON.stringify(opts.key)));
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    params = params === '' ? '' : '?' + params;

    // We are referencing a query defined in the design doc
    var parts = location.split('/');
    return request({
      method: 'GET',
      url: '_design/' + parts[0] + '/_spatial/' + parts[1] + params
    });
  }
  this.spatial = function (fun,opts,callback){
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    callback = callback || function(){};
    opts = opts||{}
    var result;
    if (typeof fun !== 'string') {
      result = promise(function(success,failure){
          failure({
          status: 400,
          error: 'invalid_request',
          reason: 'Querying with a function is not supported for Spatial Views'
        });
      });
    }else{
      result = spatialQuery(fun, opts);
    }
    result.then(function(resp){
        callback(null,resp);
    },callback);
    return result;
  }
  function spatialQuery(fun, opts) {
    if (db.type() === 'http') {
      return httpQuery(fun, opts);
    }

    var parts = fun.split('/');
    return get('_design/' + parts[0]).then(function(doc) {
      return viewQuery(doc.spatial[parts[1]], opts);
    });
  }
};
function rotateCoords(coords){
  var mins = coords[0];
  var maxs = coords[1];
  return mins.map(function(min,i){
    return [min,maxs[i]];
  });
}
// Store it in the Spatial object, so we can test it
Spatial.calculateBbox = function(coords){
  return rotateCoords(calculateBbox(coords));
}
// Deletion is a noop since we dont store the results of the view
Spatial._delete = function() { };

module.exports = Spatial;