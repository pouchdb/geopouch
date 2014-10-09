Spatial Pouch [![Build Status](https://travis-ci.org/pouchdb/geopouch.svg?branch=rtree)](https://travis-ci.org/pouchdb/geopouch)
====

Spatial plugin from PouchDB extracted and supporting N dimentional coordinates.

Origionally by [@vmx](https://github.com/) with contribution by [@daleharvey](https://github.com/) and [@calvinmetcalf](https://github.com/).

Test with `npm test` coverage report with `npm test --coverage`, build with `npm run build`.  Server queries require geocouch installed, have yet to test with that.

API
====

`db.spatial([xmin, ymin, xmax, ymax], [options, callback)];`