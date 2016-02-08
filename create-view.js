'use strict';

var upsert = require('./upsert');
var createHash = require('create-hash');
var Promise = require('lie');

function hash(string) {
  return createHash('sha224').update(string).digest('hex');
}


module.exports = function (sourceDB, viewCode, temporary, viewName) {
  if (temporary) {
    return Promise.resolve({
      db: {
        temp: true,
        get: function () {
          return Promise.resolve({_id: '_local/gclastSeq', last_seq: 0});
        }
      }
    });
  }
  var viewSignature = hash(viewCode.toString());
  if (sourceDB._cachedViews) {
    var cachedView = sourceDB._cachedViews[viewSignature];
    if (cachedView) {
      return Promise.resolve(cachedView);
    }
  }

  return sourceDB.info().then(function (info) {

    var depDbName = info.db_name + '-gcview-' + viewSignature;

    // save the view name in the source PouchDB so it can be cleaned up if necessary
    // (e.g. when the _design doc is deleted, remove all associated view data)
    function diffFunction(doc) {
      doc.views = doc.views || {};
      var fullViewName = viewSignature;

      var depDbs = doc.views[fullViewName] = doc.views[fullViewName] || {};
      /* istanbul ignore if */
      if (depDbs[depDbName]) {
        return; // no update necessary
      }
      depDbs[depDbName] = true;
      return doc;
    }
    function cleanUpView(doc) {
      if (!('views' in doc) || !(viewSignature in doc.views) || !(depDbName in doc.views[viewSignature])) {
        return;
      }
      delete doc.views[viewSignature][depDbName];
    }
    return upsert(sourceDB, '_local/gcviews', diffFunction).then(function () {
      return sourceDB.registerDependentDatabase(depDbName).then(function (res) {
        var db = res.db;
        db.auto_compaction = true;
        var view = {
          name: depDbName,
          db: db,
          sourceDB: sourceDB,
          adapter: sourceDB.adapter
        };
        return view.db.get('_local/gclastSeq').catch(function (err) {
          /* istanbul ignore if */
          if (err.status !== 404) {
            throw err;
          }
        }).then(function (lastSeqDoc) {
          view.seq = lastSeqDoc ? lastSeqDoc.seq : 0;
          var viewID;

          sourceDB._cachedViews = sourceDB._cachedViews || {};
          sourceDB._cachedViews[viewSignature] = view;
          view.db.on('destroyed', function () {
            delete sourceDB._cachedViews[viewSignature];
            upsert(sourceDB, '_local/gcviews', cleanUpView);
          });
          viewID = '_design/' + viewName.split('/')[0];
          sourceDB._viewListeners = sourceDB._viewListeners || {};
          if (!sourceDB._viewListeners[viewID]) {
            sourceDB.info().then(function (info) {
              sourceDB._viewListeners[viewID] = sourceDB.changes({live: true, since: info.update_seq});
              sourceDB._viewListeners[viewID].on('change', function (ch) {
                if (ch.id !== viewID) {
                  return;
                }
                view.db.destroy();
                sourceDB._viewListeners[viewID].cancel();
                delete sourceDB._viewListeners[viewID];
                delete sourceDB._cachedViews[viewSignature];
                upsert(sourceDB, '_local/gcviews', cleanUpView);
              });
            });
          }

          return view;
        });
      });
    });
  });
};
