"use strict";

var should   = require('should');
var async    = require('async');
var debug    = require('debug')('OSMBC:routes:config');


var express    = require('express');
var router     = express.Router();


var config = require('../config.js');

var configModule = require('../model/config.js');
var logModule = require('../model/logModule.js');






function renderConfigName(req, res, next) {
  debug('renderConfigName');
  var name = req.params.name;
  should.exist(name);
  var params = {};
  var config;
  var changes;
  async.series([
    function findConfig(cb) {
      debug('findAndCreateConfig');
      configModule.getConfigObject(name,function(err,result){
        if (err) return cb(err);
        config = result;
        // JSON is not initially saved, so create it by getting it.
        config.json = config.getJSON();
        return cb();
      });
    },
    function findAndLoadChanges(cb) {
      debug('findAndLoadChanges');
      logModule.find({table:"config",oid:config.id},{column:"timestamp",desc:true},function findAndLoadChanges_CB(err,result){
        debug('findAndLoadChanges_CB');
        if (err) return cb(err);
        changes = result;
        cb();
      });
    }
    ],
    function finalRenderCB(err) {
      debug('finalRenderCB');
      if (err) return next(err);
      should.exist(res.rendervar);
      var jadeFile = 'config';
      if (name == "calendarflags") jadeFile = name;
      if (name == "categorydescription") jadeFile = name;
      if (name == "languageflags") jadeFile = "calendarflags";
      if (name == "calendartranslation") jadeFile = name;
      if (name == "editorstrings") jadeFile = name;
      if (name == "categorytranslation") jadeFile = name;
      if (name == "automatictranslatetext") jadeFile = name;
      if (name == "slacknotification") jadeFile = name;
      if (name == "votes") jadeFile = name;
      res.set('content-type', 'text/html');
      res.render(jadeFile,{config:config,
                        changes:changes,
                        params:params,
                        layout:res.rendervar.layout});
    }
  ) ;
}

function postConfigId(req, res, next) {
  debug('postUserId');
  var name = req.params.name;
  var changes = {yaml:req.body.yaml,type:req.body.type,name:req.body.name,text:req.body.text};
  var configData;
  async.series([
    function findUser(cb) {
      debug("findConfig");
      configModule.getConfigObject(name,function(err,result) {
        debug("findById");
        configData = result;
        if (typeof(configData.id) == 'undefined') return cb(new Error("Config Not Found"));
        return cb();
      });
    },
    function saveConfig(cb) {
      configData.setAndSave(req.user.displayName,changes,function(err) {
        debug("setAndSaveCB");
        cb(err);
      });
    }

    ],function(err){
      if (err) return next(err);
      res.redirect(config.getValue('htmlroot')+"/config/"+configData.name);
  
    });

}


router.get('/:name',renderConfigName);
router.post('/:name', postConfigId);


module.exports.router = router;
