"use strict";

const async  = require("async");
const should = require("should");

const sinon  = require("sinon");

const testutil = require("./testutil.js");

const userModule = require("../model/user.js");
const logModule = require("../model/logModule.js");
const mailReceiver = require("../notification/mailReceiver.js");






describe("model/user", function() {
  before(function (bddone) {
    testutil.clearDB(bddone);
  });
  describe("createNewUser", function() {
    it("should createNewUser with prototype", function(bddone) {
      userModule.createNewUser({ name: "user" }, function (err, result) {
        should.not.exist(err);
        const id = result.id;
        testutil.getJsonWithId("usert", id, function(err, result) {
          should.not.exist(err);
          should(result.name).equal("user");
          bddone();
        });
      });
    });
    it("should createNewUser without prototype", function(bddone) {
      userModule.createNewUser(function (err, result) {
        should.not.exist(err);
        const id = result.id;
        testutil.getJsonWithId("usert", id, function(err) {
          should.not.exist(err);
          bddone();
        });
      });
    });
    it("should create no New User with ID", function(bddone) {
      userModule.createNewUser({ id: 2, OSMUser: "me again" }, function (err) {
        should.exist(err);
        should(err.message).eql("user id exists");
        bddone();
      });
    });
    it("should create no New User with existing name", function(bddone) {
      userModule.createNewUser({ OSMUser: "TestUser" }, function (err) {
        should.not.exist(err);
        userModule.createNewUser({ OSMUser: "TestUser" }, function(err) {
          should.exist(err);
          should(err.message).eql("User >TestUser< already exists.");
          bddone();
        });
      });
    });
  });
  describe("findFunctions", function() {
    let idToFindLater;
    before(function (bddone) {
      // Initialise some Test Data for the find functions
      async.series([
        testutil.clearDB,
        function c1(cb) { userModule.createNewUser({ OSMUser: "TheFive", access: "full" }, cb); },
        function c2(cb) { userModule.createNewUser({ OSMUser: "Test", access: "denied" }, cb); },
        function c3(cb) {
          userModule.createNewUser({ OSMUser: "Test2", access: "full" },
            function(err, result) {
              should.not.exist(err);
              idToFindLater = result.id;
              cb(err);
            });
        }

      ], function(err) {
        should.not.exist(err);
        bddone();
      });
    });
    describe("find", function() {
      it("should find multiple objects with sort", function(bddone) {
        userModule.find({ access: "full" }, { column: "OSMUser" }, function(err, result) {
          should.not.exist(err);
          should.exist(result);
          should(result.length).equal(2);
          delete result[0]._meta;
          delete result[0].id;
          delete result[1]._meta;
          delete result[1].id;
          should(result[0]).eql({ OSMUser: "Test2", access: "full", version: 1 });
          should(result[1]).eql({ OSMUser: "TheFive", access: "full", version: 1 });
          bddone();
        });
      });
    });
    describe("findOne", function() {
      it("should findOne object with sort", function(bddone) {
        userModule.findOne({ OSMUser: "Test" }, function(err, result) {
          should.not.exist(err);
          should.exist(result);
          delete result._meta;
          delete result.id;
          should(result).eql({ OSMUser: "Test", access: "denied", version: 1 });
          bddone();
        });
      });
    });
    describe("findById", function() {
      it("should find saved Object", function(bddone) {
        userModule.findById(idToFindLater, function(err, result) {
          should.not.exist(err);
          should.exist(result);
          delete result._meta;
          delete result.id;
          should(result).eql({ OSMUser: "Test2", access: "full", version: 1 });
          bddone();
        });
      });
    });
  });
  describe("setAndSave", function() {
    let oldtransporter;
    beforeEach(function (bddone) {
      oldtransporter = mailReceiver.for_test_only.transporter.sendMail;
      mailReceiver.for_test_only.transporter.sendMail = sinon.spy(function(obj, doit) { return doit(null, { response: "t" }); });
      testutil.importData({
        clear: true,
        user: [{ OSMUser: "WelcomeMe", email: "none", lastAccess: (new Date()).toISOString() },
          { OSMUser: "InviteYou", email: "invite@mail.org" },
          { OSMUser: "DeniedUser", access: "denied", email: "this.is@mymail" }]
      }, bddone);
    });
    afterEach(function (bddone) {
      mailReceiver.for_test_only.transporter.sendMail = oldtransporter;
      bddone();
    });
    it("should set only the one Value in the database", function (bddone) {
      let newUser;
      userModule.createNewUser({ OSMUser: "Test", access: "full" }, function(err, result) {
        should.not.exist(err);
        newUser = result;
        const id = result.id;
        newUser.access = "not logged";
        newUser.setAndSave({ OSMUser: "user" }, { version: 1, OSMUser: "Test2", access: "not logged" }, function(err) {
          should.not.exist(err);
          testutil.getJsonWithId("usert", id, function(err, result) {
            should.not.exist(err);
            delete result._meta;
            should(result).eql({ id: id, access: "not logged", OSMUser: "Test2", version: 2 });
            logModule.find({}, { column: "property" }, function (err, result) {
              should.not.exist(err);
              should.exist(result);
              should(result.length).equal(1);
              const r0id = result[0].id;
              const t0 = result[0].timestamp;
              const now = new Date();
              const t0diff = ((new Date(t0)).getTime() - now.getTime());

              // The Value for comparison should be small, but not to small
              // for the test machine.
              should(t0diff).be.below(10);
              should(result[0]).eql({ id: r0id, timestamp: t0, oid: id, user: "user", table: "usert", property: "OSMUser", from: "Test", to: "Test2" });

              // There should be no mail
              should(mailReceiver.for_test_only.transporter.sendMail.called).be.False();
              bddone();
            });
          });
        });
      });
    });
    it("should ignore unchanged Values", function (bddone) {
      let newUser;
      userModule.createNewUser({ OSMUser: "Test", access: "full" }, function(err, result) {
        should.not.exist(err);
        newUser = result;
        const id = result.id;
        const changeValues = {};
        changeValues.OSMUser = newUser.OSMUser;
        changeValues.access = newUser.access;
        changeValues.version = 1;
        newUser.setAndSave({ OSMUser: "user" }, changeValues, function(err) {
          should.not.exist(err);
          testutil.getJsonWithId("usert", id, function(err, result) {
            should.not.exist(err);
            delete result._meta;
            should(result).eql({ id: id, OSMUser: "Test", access: "full", version: 2 });
            logModule.find({}, { column: "property" }, function (err, result) {
              should.not.exist(err);
              should.exist(result);
              should(result.length).equal(0);

              // There should be no mail
              should(mailReceiver.for_test_only.transporter.sendMail.called).be.False();
              bddone();
            });
          });
        });
      });
    });
    it("should trim OSM User Name", function (bddone) {
      let newUser;
      userModule.createNewUser({ OSMUser: "Test", access: "full" }, function(err, result) {
        should.not.exist(err);
        newUser = result;
        const id = result.id;
        const changeValues = {};
        changeValues.OSMUser = " Untrimmed Username ";
        changeValues.access = newUser.access;
        changeValues.version = 1;
        newUser.setAndSave({ OSMUser: "user" }, changeValues, function(err) {
          should.not.exist(err);
          testutil.getJsonWithId("usert", id, function(err, result) {
            should.not.exist(err);
            delete result._meta;
            should(result).eql({ id: id, OSMUser: "Untrimmed Username", access: "full", version: 2 });
            logModule.find({}, { column: "property" }, function (err, result) {
              should.not.exist(err);
              should.exist(result);
              should(result.length).equal(1);

              // There should be no mail
              should(mailReceiver.for_test_only.transporter.sendMail.called).be.False();
              bddone();
            });
          });
        });
      });
    });
    it("should fail when change email by another user", function (bddone) {
      userModule.findOne({ OSMUser: "WelcomeMe" }, function(err, user) {
        should.not.exist(err);
        // First set a new EMail Address for the WelcomeMe user, by InviteYou.
        user.setAndSave({ OSMUser: "InviteYou" }, { email: "WelcomeMe@newemail.org" }, function (err) {
          const expectedErr = new Error("EMail address can only be changed by the user himself, after he has logged in.");
          expectedErr.status = 401;
          should(err).eql(expectedErr);
          bddone();
        });
      });
    });
    it("should fail when change email for denied user (no delete)", function (bddone) {
      userModule.findOne({ OSMUser: "DeniedUser" }, function(err, user) {
        should.not.exist(err);
        // First set a new EMail Address for the WelcomeMe user, by InviteYou.
        user.setAndSave({ OSMUser: "InviteYou" }, { email: "WelcomeMe@newemail.org" }, function (err) {
          const expectedErr = new Error("EMail address can only be changed by the user himself, after he has logged in.");
          expectedErr.status = 401;
          should(err).eql(expectedErr);
          bddone();
        });
      });
    });
    it("should allow maildelete for denied users", function (bddone) {
      userModule.findOne({ OSMUser: "DeniedUser" }, function(err, user) {
        should.not.exist(err);
        // First set a new EMail Address for the WelcomeMe user, by InviteYou.
        user.setAndSave({ OSMUser: "InviteYou" }, { email: "none" }, function (err) {
          should.not.exist(err);
          userModule.findOne({ OSMUser: "DeniedUser" }, function(err, user) {
            should.not.exist(err);
            should(user.email).eql(undefined);
            bddone();
          });
        });
      });
    });
    it("should trim an email adress", function (bddone) {
      userModule.findOne({ OSMUser: "WelcomeMe" }, function(err, user) {
        should.not.exist(err);
        // First set a new EMail Address for the WelcomeMe user, by InviteYou.
        user.setAndSave({ OSMUser: "WelcomeMe" }, { email: " NewEmail@newemail.org ", OSMUser: "WelcomeMe" }, function (err) {
          should.not.exist(err);
          testutil.getJsonWithId("usert", user.id, function(err, result) {
            should.not.exist(err);
            should(result.emailInvalidation).eql("NewEmail@newemail.org");
            bddone();
          });
        });
      });
    });
    it("should fail when username is changed and user once logged in", function (bddone) {
      userModule.findOne({ OSMUser: "WelcomeMe" }, function(err, user) {
        should.not.exist(err);
        // First set a new EMail Address for the WelcomeMe user, by InviteYou.
        user.setAndSave({ OSMUser: "InviteYou" }, { OSMUser: "NameChange" }, function (err) {
          const expectedErr = new Error(">" + user.OSMUser + "< already has logged in, change in name not possible.");
          expectedErr.status = 403;
          should(err).eql(expectedErr);
          bddone();
        });
      });
    });
  });
});

