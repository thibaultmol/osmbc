"use strict";

const pgMap          = require("./pgMap.js");
const util           = require("../util/util.js");
const debug          = require("debug")("OSMBC:model:user");
const assert         = require("assert").strict;
const async          = require("../util/async_wrap.js");
const messageCenter  = require("../notification/messageCenter.js");
const mailReceiver   = require("../notification/mailReceiver.js");
const random         = require("randomstring");
const emailValidator = require("email-validator");
const config         = require("../config.js");
const cheerio        = require("cheerio");
const axios          = require("axios");
const logger         = require("../config.js").logger;
const HttpStatus     = require("http-status-codes");

// generate an user object, use Prototpye
// to prototype some fields
function User(proto) {
  debug("User");
  debug("Prototype %s", JSON.stringify(proto));
  this.id = 0;
  for (const k in proto) {
    this[k] = proto[k];
  }
}


// return a new User Object (in memory)
// Optional: Protoype
function create(proto) {
  debug("create");
  return new User(proto);
}


// create a new user in the database
// avoid doublettes in OSMUser (osm account).
function createNewUser (proto, callback) {
  if (typeof (proto) === "function") {
    callback = proto;
    proto = null;
  }
  function _createNewUser(proto, callback) {
    debug("createNewUser");
    if (proto && proto.id) {
      const e = new Error("user id exists");
      e.status = HttpStatus.CONFLICT;
      return callback(e);
    }
    const user = create(proto);
    find({ OSMUser: user.OSMUser }, function (err, result) {
      if (err) return callback(err);
      if (result && result.length > 0) {
        const err = new Error("User >" + user.OSMUser + "< already exists.");
        err.status = HttpStatus.CONFLICT;
        return callback(err);
      }
      // set some defaults for the user
      if (!proto) user.mailNewCollection = "false";
      if (!proto) user.mailAllComment = "false";
      if (!proto) user.mailComment = [];
      if (!proto) user.mailBlogLanguageStatusChange = [];
      // save data
      user.save(function updateUser(err, result) {
        if (err) return callback(err, result);
        mailReceiver.updateUser(result);
        return callback(null, result);
      });
    });
  }
  if (callback) {
    return _createNewUser(proto, callback);
  }
  return new Promise((resolve, reject) => {
    _createNewUser(proto, (err, user) => (err) ? reject(err) : resolve(user));
  });
}

const avatarCache = {};

function cacheOSMAvatar(osmuser, callback) {
  debug("cacheOSMAvatar %s", osmuser);
  if (osmuser === undefined) return callback();
  if (process.env.NODE_ENV === "test") return callback();
  if (avatarCache[osmuser]) return callback();
  const requestString = "https://www.openstreetmap.org/user/" + encodeURI(osmuser);
  axios({
    method: "GET",
    url: requestString,
    timeout: 1000
  }).then(function(response) {
    if (response.data) {
      const c = cheerio.load(response.data);
      let avatarLink = c(".user_image").attr("src");
      const title = c("title").text();
      if (title === "No such user | OpenStreetMap") return callback();
      if (avatarLink === undefined) {
        return callback();
      }
      if (avatarLink.substring(0, 1) === "/") avatarLink = "https://www.openstreetmap.org" + avatarLink;
      avatarCache[osmuser] = avatarLink;
    }
    return callback();
  }).catch(function(err) {
    if (err.message !== "ETIMEDOUT") {
      const error = new Error("User " + osmuser + " avatar could not be loaded.");
      return callback(error, null);
    }
    return callback();
  });
}

function cacheOSMAvatarAll(callback) {
  debug("cacheOSMAvatarAll");
  find({}, function(err, users) {
    if (err) return callback(err);
    async.eachLimit(users, 4, function (item, cb) {
      cacheOSMAvatar(item.OSMUser, cb);
    }, function(err) {
      return callback(err);
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  cacheOSMAvatarAll(function(err) {
    if (err) logger.info("Error during Cache of User Avatar " + err.message);
  });
}

// Calculate derived values
// now: Calculate only number of changes
User.prototype.calculateChanges = function calculateChanges(callback) {
  debug("User.prototype.calculateChanges");
  const self = this;
  if (self._countChanges) return;
  pgMap.count("select count(*) as count from changes where data->>'user'=$1 and data->>'table'='article'", [this.OSMUser], function(err, result) {
    if (err) return callback(err);
    self._countChanges = result.count;
    return callback();
  });
};


function getAvatar(osmuser) {
  debug("getAvatar");
  /* jshint -W040 */
  if (osmuser === undefined && this !== undefined) osmuser = this.OSMUser;
  cacheOSMAvatar(osmuser, function() {});
  /* jshint +W040 */
  return avatarCache[osmuser];
}


User.prototype.getAvatar = getAvatar;
module.exports.getAvatar = getAvatar;

// use some database function from pgMap
User.prototype.remove = pgMap.remove;

function find(obj, ord, callback) {
  if (typeof ord === "function") {
    callback = ord;
    ord = undefined;
  }
  function _find(obj, ord, callback) {
    debug("find");
    pgMap.find({ table: "usert", create: create }, obj, ord, callback);
  }
  if (callback) return _find(obj, ord, callback);
  return new Promise(function(resolve, reject) {
    _find(obj, ord, function(err, result) {
      if (err) return reject(err);
      return resolve(result);
    });
  });
}
function findById(id, callback) {
  function _findById(id, callback) {
    debug("findById %s", id);
    pgMap.findById(id, { table: "usert", create: create }, callback);
  }
  if (callback) return _findById(id, callback);
  return new Promise(function(resolve, reject) {
    _findById(id, function(err, result) {
      if (err) return reject(err);
      return resolve(result);
    });
  });
}


function findOne(obj1, obj2, callback) {
  if (typeof obj2 === "function") {
    callback = obj2;
    obj2 = null;
  }
  function _findOne(obj1, obj2, callback) {
    debug("findOne");
    pgMap.findOne({ table: "usert", create: create }, obj1, obj2, callback);
  }
  if (callback) {
    return _findOne(obj1, obj2, callback);
  }
  return new Promise((resolve, reject) => {
    _findOne(obj1, obj2, (err, result) => err ? reject(err) : resolve(result));
  });
}


const pgObject = {};
pgObject.createString = "CREATE TABLE usert (  id bigserial NOT NULL,  data json,  \
                  CONSTRAINT user_pkey PRIMARY KEY (id) ) WITH (  OIDS=FALSE);";
pgObject.indexDefinition = {
  user_id_idx: "CREATE INDEX user_id_idx ON usert USING btree (((data ->> 'OSMUser'::text)))",
  user_id2_idx: "CREATE INDEX user_id2_idx ON usert USING btree (id)"


};
pgObject.viewDefinition = {};
pgObject.table = "usert";
module.exports.pg = pgObject;


// This function is called by the link
// send out via EMail if someone registers a new email
User.prototype.validateEmail = function validateEmail(user, validationCode, callback) {
  debug("validateEmail");
  assert(typeof (user) === "object");
  assert(typeof (validationCode) === "string");
  assert(typeof (callback) === "function");
  const self = this;
  let err;
  if (self.OSMUser !== user.OSMUser) {
    debug("User is wrong");
    err = new Error("Wrong User: expected >" + self.OSMUser + "< given >" + user.OSMUser + "<");
    err.status = HttpStatus.CONFLICT;
    return callback(err);
  }
  if (!self.emailInvalidation) {
    debug("nothing in validation");
    err = new Error("No Validation pending for user >" + self.OSMUser + "<");
    err.status = HttpStatus.CONFLICT;
    return callback(err);
  }
  if (validationCode !== self.emailValidationKey) {
    debug("Validation Code is wrong");
    err = new Error("Wrong Validation Code for EMail for user >" + self.OSMUser + "<");
    err.status = HttpStatus.CONFLICT;
    messageCenter.global.sendInfo({ oid: self.id, user: user.OSMUser, table: "usert", property: "email", from: null, to: "Validation Failed" }, function() {
      return callback(err);
    });
    return;
  }
  debug("Email Validation OK saving User");
  const oldmail = self.email;
  self.email = self.emailInvalidation;
  delete self.emailInvalidation;
  delete self.emailValidationKey;
  self.save(function logit(err) {
    mailReceiver.updateUser(self);
    if (err) return callback(err);
    messageCenter.global.sendInfo({ oid: self.id, user: user.OSMUser, table: "usert", property: "email", from: oldmail, to: self.email }, function() {
      return callback(err);
    });
  });
};



// pgMap setAndSave Function,
// Check on EMail change (and trigger new validation)
// create error if user that already have logged in
// changes their OSM Account
User.prototype.setAndSave = function setAndSave(user, data, callback) {
  debug("setAndSave");
  // reset cache
  util.requireTypes([user, data, callback], ["object", "object", "function"]);
  const self = this;
  delete self.lock;
  let sendWelcomeEmail = false;
  // remove spaces from front and and of email adress
  if (data.email) data.email = data.email.trim();
  if (data.OSMUser) data.OSMUser = data.OSMUser.trim();
  if (data.OSMUser === "autocreate") {
    const err = new Error("User >autocreate< not allowed");
    err.status = HttpStatus.CONFLICT;
    return callback(err);
  }


  // check and react on Mail Change
  if (data.email && data.email.trim() !== "" && data.email !== self.email) {
    const err =  Error("EMail address can only be changed by the user himself, after he has logged in.");
    err.status = HttpStatus.UNAUTHORIZED;
    if (self.access === "denied" && data.email !== "none") return callback(err);
    if (self.OSMUser !== user.OSMUser && self.hasLoggedIn()) return callback(err);

    if (data.email !== "resend" && data.email !== "none") {
      if (!emailValidator.validate(data.email)) {
        const error = new Error("Invalid Email Address: " + data.email);
        error.status = HttpStatus.CONFLICT;
        return callback(error);
      }
      if (data.email !== "") {
        // put email to validation email, and generate a key.
        data.emailInvalidation = data.email;
        data.emailValidationKey = random.generate();
        sendWelcomeEmail = true;
        delete data.email;
      }
    }
    if (data.email === "resend") {
      // resend case.
      sendWelcomeEmail = true;
      delete data.email;
    }
  }
  // Check Change of OSMUser Name.
  if (data.OSMUser !== self.OSMUser) {
    if (self.hasLoggedIn()) {
      const error = new Error(">" + self.OSMUser + "< already has logged in, change in name not possible.");
      error.status = HttpStatus.FORBIDDEN;
      return callback(error);
    }
  }
  async.series([
    function checkUserName(cb) {
      if (data.OSMUser && data.OSMUser !== self.OSMUser) {
        find({ OSMUser: data.OSMUser }, function(err, result) {
          if (err) return callback(err);
          if (result && result.length) {
            const err = new Error("User >" + data.OSMUser + "< already exists.");
            err.status = HttpStatus.CONFLICT;
            return cb(err);
          } else return cb();
        });
      } else return cb();
    },
    cacheOSMAvatar.bind(null, data.OSMUser)
  ], function finalFunction(err) {
    if (err) return callback(err);
    async.eachOfSeries(data, function setAndSaveEachOf(value, key, cbEachOf) {
      // There is no Value for the key, so do nothing
      if (typeof (value) === "undefined") return cbEachOf();

      // The Value to be set, is the same then in the object itself
      // so do nothing
      if (value === self[key]) return cbEachOf();
      if (JSON.stringify(value) === JSON.stringify(self[key])) return cbEachOf();
      if (typeof (self[key]) === "undefined" && value === "") return cbEachOf();


      debug("Set Key %s to value >>%s<<", key, value);
      debug("Old Value Was >>%s<<", self[key]);


      const timestamp = new Date();
      async.series([
        function(cb) {
          // do not log validation key in logfile
          const toValue = value;
          // Hide Validation Key not to show to all users
          if (key === "emailValidationKey") return cb();

          messageCenter.global.sendInfo({
            oid: self.id,
            user: user.OSMUser,
            table: "usert",
            property: key,
            from: self[key],
            timestamp: timestamp,
            to: toValue
          },
          cb);
        },
        function(cb) {
          if (key === "email" && value === "none") {
            delete self.email;
            delete self.emailValidationKey;
            delete self.emailInvalidation;
            return cb();
          }
          self[key] = value;
          cb();
        }
      ], function(err) {
        cbEachOf(err);
      });
    }, function setAndSaveFinalCB(err) {
      debug("setAndSaveFinalCB");
      if (err) return callback(err);
      self.save(function (err) {
        // Inform Mail Receiver Module, that there could be a change
        if (err) return callback(err);
        // tell mail receiver to update the information about the users
        mailReceiver.updateUser(self);
        if (sendWelcomeEmail) {
          const m = new mailReceiver.MailReceiver(self);
          // do not wait for mail to go out.
          // mail is logged in outgoing mail list
          m.sendWelcomeMail(user.OSMUser, function () {});
        }
        return callback();
      });
    });
  });
};


User.prototype.hasLoggedIn = function hasLoggedIn() {
  debug("User.prototype.hasLoggedIn");
  if (this.lastAccess) return true;
  return false;
};


User.prototype.getNotificationStatus = function getNotificationStatus(channel, type) {
  debug("User.prototype.getNotificationStatus");
  if (!this.notificationStatus) return null;
  if (!this.notificationStatus[channel]) return null;
  return this.notification[channel][type];
};

User.prototype.getLanguageConfig = function getLanguageConfig() {
  debug("User.prototype.getLanguageConfig");
  if (this.languageSet && this.languageSet !== "") {
    if (this.languageSets && this.languageSets[this.languageSet]) {
      if (!Array.isArray(this.languageSets[this.languageSet])) {
        return this.languageSets[this.languageSet];
      }
      return {
        languages: this.languageSets[this.languageSet],
        translationServices: this.translationServices,
        translationServicesMany: this.translationServicesMany
      };
    }
  }
  return {
    languages: this.langArray,
    translationServices: this.translationServices,
    translationServicesMany: this.translationServicesMany
  };
};

User.prototype.getLanguages = function getLanguages() {
  debug("User.prototype.getLanguages");
  return this.getLanguageConfig().languages;
};

User.prototype.getLanguageSets = function getLanguages() {
  debug("User.prototype.getLanguageSets");
  const languageSets = [];
  for (const set in this.languageSets ?? {}) {
    languageSets.push(set);
  }
  return languageSets;
};

User.prototype.saveLanguageSet = function saveLanguageSet(setName, callback) {
  debug("User.prototype.saveLanguageSet");
  if (typeof this.languageSets === "undefined") {
    this.languageSets = {};
  }
  this.languageSets[setName] = {
    languages: this.langArray,
    translationServices: this.translationServices,
    translationServicesMany: this.translationServicesMany
  };
  this.languageSet = setName;
  this.save(callback);
};

User.prototype.deleteLanguageSet = function deleteLanguageSet(setName, callback) {
  debug("User.prototype.saveLanguageSet");
  if (typeof this.languageSets === "undefined") {
    this.languageSets = {};
  }
  delete this.languageSets[setName];
  if (this.languageSet === setName) this.languageSet = "";
  this.save(callback);
};


User.prototype.getMainLang = function getMainLang() {
  debug("User.prototype.getMainLang");
  if (this.langArray && this.langArray[0]) return this.langArray[0];
  if (this.mainLang) return this.mainLang;
  if (this.language) return this.language;
  return "EN";
};

User.prototype.getSecondLang = function getSecondLang() {
  debug("User.prototype.getMainLang");
  if (this.langArray && this.langArray[1]) return this.langArray[1];
  if (this.secondLang) return this.secondLang;
  return null;
};

User.prototype.getLang3 = function getLang3() {
  debug("User.prototype.getLang3");
  if (this.langArray && this.langArray[2]) return this.langArray[2];
  if (this.lang3) return this.lang3;
  return null;
};

User.prototype.getLang4 = function getLang4() {
  debug("User.prototype.getLang4");
  if (this.langArray && this.langArray[3]) return this.langArray[3];
  if (this.lang4) return this.lang4;
  return null;
};

User.prototype.getLang = function getLang(i) {
  debug("User.prototype.getLang");
  if (!this.langArray) {
    this.langArray = [];
    this.langArray[0] = this.getMainLang();
    if (this.getSecondLang()) this.langArray[1] = this.getSecondLang();
    if (this.getLang3()) this.langArray[2] = this.getLang3();
    if (this.getLang4()) this.langArray[3] = this.getLang4();
  }
  return (this.langArray[i]);
};

User.prototype.getTranslations = function getTranslations() {
  const lConfig = this.getLanguageConfig();
  const result = [...(lConfig.translationServices ?? [])];
  const onTop = lConfig.translationServicesMany ?? [];
  onTop.forEach(function (item) {
    if (result.indexOf(item) < 0) result.push(item);
  });
  return result;
};

User.prototype.useOneTranslation = function useOneTranslation(service) {
  const lConfig = this.getLanguageConfig();
  const result = lConfig.translationServices ?? [];
  return (result.indexOf(service) >= 0);
};

User.prototype.useManyTranslation = function useManyTranslation(service) {
  const lConfig = this.getLanguageConfig();
  const result = lConfig.translationServicesMany ?? [];
  return (result.indexOf(service) >= 0);
};


User.prototype.setOption = function setOption(view, option, value) {
  debug("User.prototype.setOption");
  if (!this.option) this.option = {};
  if (!this.option[view]) this.option[view] = {};
  this.option[view][option] = value;
};


const defaultOption = {};

User.prototype.getOption = function getOption(view, option) {
  debug("User.protoype.getOption");
  if (this.option && this.option[view] && this.option[view][option]) return this.option[view][option];
  if (defaultOption && defaultOption[view] && defaultOption[view][option]) return defaultOption[view][option];
  return null;
};

User.prototype.hasFullAccess = function hasFullAccess() {
  debug("User.protoype.hasFullAccess");
  return this.access === "full";
};

User.prototype.hasGuestAccess = function hasFullAccess() {
  debug("User.protoype.hasFullAccess");
  return this.access === "guest";
};



User.prototype.createApiKey = function createApiKey(callback) {
  debug("createApiKey");
  const apiKey = random.generate({ length: 10 });
  this.apiKey = apiKey;
  this.save(callback);
};


// this functions returns (and caches) the new users
// Users that have done their first edit in the last month

let _newUsers = null;
const interval = config.getValue("WelcomeInterval", { mustExist: true });
const welcomeRefresh = config.getValue("WelcomeRefreshInSeconds", { mustExist: true });


module.exports.getNewUsers = function getNewUsers(callback) {
  debug("getNewUsers");



  if (welcomeRefresh > 0 && _newUsers) return callback(null, _newUsers);


  pgMap.select("select changes.data->>'user' as osmuser ,min(changes.data->>'timestamp') as first, usert.data->>'access' as access from changes inner join usert on changes.data->>'user' = usert.data->>'OSMUser' group by changes.data->>'user',usert.data->>'access' having ( min(changes.data->>'timestamp')  )::timestamp with time zone  > ($1)::timestamp with time zone - interval '" + interval + "'", [new Date().toISOString()], function(err, result) {
    if (err) return callback(err);
    if (result.indexOf("autocreate") >= 0) {
      result = result.splice(result.indexOf("autocreate"), result.indexOf("autocreate") + 1);
    }
    if (welcomeRefresh > 0) {
      _newUsers = result;
      setTimeout(function() {
        _newUsers = null;
      }, welcomeRefresh * 1000);
    }
    callback(null, result);
  });
};

function migrateData(user) {
  // This function can be used to modify user because of data modell changes

  // migrate from lang to langArray
  if (!user.langArray) {
    user.langArray = [user.getMainLang(), user.getSecondLang(), user.getLang3(), user.getLang4()];
    delete user.mainLang;
    delete user.language;
    delete user.secondLang;
    delete user.lang3;
    delete user.lang4;
  }
}

// Creates an User object and stores it to database
// can use a prototype to initialise data
// Parameter: Prototype (optional)
//            callback
// Prototype is not allowed to have an id
module.exports.createNewUser = createNewUser;


// save stores the current object to database
User.prototype.save = pgMap.save; // Create Tables and Views


module.exports.create = create;
module.exports.migrateData = migrateData;
module.exports.find = find;
module.exports.findById = findById;
module.exports.findOne = findOne;

User.prototype.getTable = function getTable() {
  return "usert";
};
