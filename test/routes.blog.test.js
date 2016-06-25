"use strict";

var async = require('async');
var sinon = require('sinon');
var nock  = require('nock');
var should = require('should');

var testutil = require('../test/testutil.js');
var blogModule = require('../model/blog.js');
var userModule = require('../model/user.js');

require('jstransformer-verbatim');

var blogRouter = require('../routes/blog.js');




describe('routes/blog',function() {
  var user = null;
  beforeEach(function(bddone){
    async.series([
      testutil.clearDB,
      function cu(cb) {
        userModule.createNewUser({OSMUser:"TestUser",displayName:"TestUser"},function (err,result){
          if (err) cb(err);
          user = result;
          cb();
        });
      }
    ],bddone);  });
  before(function(bddone){
    nock('https://hooks.slack.com/')
            .post(/\/services\/.*/) 
            .times(999) 
            .reply(200,"ok");
    bddone();
  });
  after(function(bddone){
    nock.cleanAll();
    bddone();
  });

  describe('renderBlogPreview',function() {
    it('should call next if blog id not exist',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{title:"WN333"},function(err,blog) {
        should.not.exist(err);
        should(blog.id).not.equal(0);
        var newId = blog.id +1;
        var req = {};
        req.params = {};
        req.session = {};
        req.params.blog_id = newId;
        req.user = {};

        var res = {};
        res.set = function(){};
        var next;

        async.series([
          function(callback) {
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogPreview(req,res,next);
          }],
          function(err) {
            should.exist(err);
            should(next.called).be.true();
            should(res.render.called).be.false();
            bddone();            
          }
        );
      });
    });
    it('should call next if blog name not exist',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{title:"WN333"},function(err,blog) {
        should.not.exist(err);
        should(blog.id).not.equal(0);
        var newId = "WN332";
        var req = {};
        req.params = {};
        req.user = {};
        req.session = {};
        req.params.blog_id = newId;
        var res = {};
        res.set = function(){};
        var next;

        async.series([
          function(callback) {
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogPreview(req,res,next);
          }],
          function(err) {
            should.exist(err);
            should(next.called).be.true();
            should(res.render.called).be.false();
            bddone();            
          }
        );
      });
    });
    it('should call next if blog exists twice',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{name:"WN333"},function(err,blog) {
        should.not.exist(err);
        blogModule.createNewBlog({OSMUser:"test"},{name:"WN333"},function(err,blog2) {
          should.not.exist(err);
          should.exist(blog2);
          should(blog.id).not.equal(0);
          var newId = "WN333";
          var req = {};
          req.params = {};
          req.params.blog_id = newId;
          req.user = {};
          req.session = {};
          var res = {};
          res.set = function(){};
          var next;

          async.series([
            function(callback) {
              res.render = sinon.spy(callback);
              next = sinon.spy(callback);
              blogRouter.renderBlogPreview(req,res,next);
            }],
            function(err) {
              should.exist(err);
              should(next.called).be.true();

              should(res.render.called).be.false();
              var call = next.firstCall;
              should(call.args[0].message).equal("Blog >WN333< exists twice, internal id of first: 1");

              bddone();            
            }
          );
        });
      });
    });
    it('should render a blog Preview',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{name:"WN333",startDate:"2015-12-12T00:00:00",endDate:"2015-12-13T00:00:00"},function(err,blog) {
        should.not.exist(err);
        should(blog.id).not.equal(0);
        var newId = "WN333";
        var req = {};
        req.params = {};
        req.params.blog_id = newId;
        req.query = {};
        req.user = {};
        req.session = {};
        req.originalUrl = "returnToUrlXX";

        var next;
        var res = {rendervar:{layout:"calculated layout"}};
        res.set = function(){};

        async.series([
          function(callback) {
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogPreview(req,res,next);
          }],
          function(result) {
            should(result).equal('blogpreview');
            should(next.called).be.False();

            should(res.render.called).be.True();
            var call = res.render.firstCall;
            var v = call.args[1];



            should(v.preview).equal('<p>12.12.2015-13.12.2015</p>\n<p align="right"><i>Diese Wochennotiz wurde erstellt von .</i></p>\n');
            should(v.blog.id).equal(blog.id);
            should(v.layout).equal("calculated layout");
            //should(v.articles.length).equal(0);
            should(v.lang).equal("DE");
            should(v.returnToUrl).equal("returnToUrlXX");

      
            bddone();            
          }
        );
      },true); // do not create additional articles
    });
  });
  describe('renderBlogTab',function() {
    it('should call next if blog id not exist',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{title:"WN333"},function(err,blog) {
        should.not.exist(err);
        should(blog.id).not.equal(0);
        var newId = blog.id +1;
        var req = {};
        req.params = {};
        req.params.blog_id = newId;
        req.session = {};
        req.user = user;
        req.query = {};

        var res = {};
        res.set = function(){};
        var next;

        async.series([
          function(callback) {
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogTab(req,res,next);
          }],
          function(err) {
            should.exist(err);
            should(next.called).be.true();
            should(res.render.called).be.false();
            bddone();            
          }
        );
      });
    });
    it('should call next if blog name not exist',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{title:"WN333"},function(err,blog) {
        should.not.exist(err);
        should(blog.id).not.equal(0);
        var newId = "WN332";
        var req = {};
        req.params = {};
        req.params.blog_id = newId;
        req.session = {};
        req.user = user;
        req.query = {};
        var res = {};
        res.set = function(){};
        var next;

        async.series([
          function(callback) {
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogTab(req,res,next);
          }],
          function(err) {
            should.exist(err);
            should(next.called).be.true();
            should(res.render.called).be.false();
            bddone();            
          }
        );
      });
    });
    it('should call next if blog exists twice',function(bddone) {
      blogModule.createNewBlog({OSMUser:"test"},{name:"WN333"},function(err,blog) {
        should.not.exist(err);
        blogModule.createNewBlog({OSMUser:"test"},{name:"WN333"},function(err,blog2) {
          should.not.exist(err);
          should.exist(blog2);
          should(blog.id).not.equal(0);
          var newId = "WN333";
          var req = {};
          req.params = {};
          req.params.blog_id = newId;
          req.session = {};
          req.query = {};
          req.user = user;
          var res = {};
          res.set = function(){};
          var next;

          async.series([
            function(callback) {
              res.render = sinon.spy(callback);
              next = sinon.spy(callback);
              blogRouter.renderBlogTab(req,res,next);
            }],
            function(err) {
              should.exist(err);
              should(next.called).be.true();

              should(res.render.called).be.false();
              var call = next.firstCall;
              should(call.args[0].message).equal("Blog >WN333< exists twice, internal id of first: 1");

              bddone();            
            }
          );
        });
      });
    });
  });
 /*describe('Render Blog ID File Based',function() {
    beforeEach(function (bddone) {
      testutil.clearDB(bddone);
    });
    function doATest(filename) {
     
      it('should handle testfile '+filename,function (bddone) {
        var file =  path.resolve(__dirname,'data', filename);
        var data =  JSON.parse(fs.readFileSync(file));
       
        var blog;
        var md;
        var html;
        var articles;

        var res;

        async.series([
          function(done) {
            testutil.importData(data,done);
          },
          function callRenderBlogId(callback) {
            var req = {};
            req.params = {};
            req.params.blog_id = data.testBlogName;
            req.query = {};
            if (data.style) req.query.style = data.style;
            req.user = {};
            req.session = {articleReturnTo:"returnToUrlXX"};

            res = {rendervar:{layout:"calculated layout"}};
            res.render = sinon.spy(callback);
            next = sinon.spy(callback);
            blogRouter.renderBlogId(req,res,next);
          }
          ],
          function (call) {
            should(call).equal("blog");
            should(res.render.called).be.True();
            var call = res.render.firstCall;
            var v = call.args[1];


            should(v.blog.name).equal(data.testBlogName);
            should(v.layout).equal("calculated layout");
            should(v.main_text).equal(data.result.main_text);
            for (var i = 0;i<data.result.changes.length;i++) {
              should(v.change[i].user)=data.result.changes[i].user;
              should(v.change[i].from)=data.result.changes[i].from;
              should(v.change[i].to)=data.result.changes[i].to;
            }
           
            should(v.style).equal(data.result.style);
            should(v.left_lang).equal(data.result.left_lang);
            should(v.right_lang).equal(data.result.right_lang);


   
            bddone();
          }
        )   
      })
    }
    testutil.generateTests("data",/^router.blog.renderBlogId.+json/,doATest);
  })*/  
});