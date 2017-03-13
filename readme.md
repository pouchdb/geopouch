Spatial Pouch [![Build Status](https://travis-ci.org/pouchdb/geopouch.svg?branch=rtree)](https://travis-ci.org/pouchdb/geopouch)
====

[![Greenkeeper badge](https://badges.greenkeeper.io/pouchdb/geopouch.svg)](https://greenkeeper.io/)

Spatial plugin from PouchDB extracted and supporting N dimensional coordinates.

Originally by [@vmx](https://github.com/vmx) with contribution by [@daleharvey](https://github.com/daleharvey) and [@calvinmetcalf](https://github.com/calvinmetcalf).

Test with `npm test` coverage report with `npm test --coverage`, build with `npm run build`.

API
====

`PouchDB.plugin(require('geopouch'));`

`db.spatial(function (doc) {emit(doc.geometry);}, [xmin, ymin, xmax, ymax], options, callback);`

`db.spatial('ddoc/functionName', [xmin, ymin, xmax, ymax], options, callback);`

`db.spatial('ddoc/functionName', [[xmin, ymin], [xmax, ymax]], options, callback);`

`db.spatial('ddoc/functionName', [[xmin, ymin, zmin], [xmax, ymax, zmax]], options, callback);`

`db.spatial('ddoc/functionName', [xmin, ymin, zmin], [xmax, ymax, zmax], options, callback);`

`db.spatial('ddoc/functionName', [xmin, ymin, xmax, ymax], options).then(function (result) {}, function (err) {});`

you may either give a function or a path to a ddoc, bounding boxes may be given in one of 3 formats

- single array with 4 numbers, these are interpreted as `[xmin, ymin, xmax, ymax]`
- single array with 2 arrays in it these are interpreted as `[[mins], [maxs]]`
- 2 arrays with numbers in them, first one is interpreted as mins, second one as maxes

If the callback is omited then a promise is returned.

Options are optional and valid options are include_docs and stale
