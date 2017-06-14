/*
 * This class acts mainly as an initializer.
 * We try to identify if we've talked to this user before or if they are new.
 *
 * If they are an existing user, we will check if they already have their preferences filled out.
 *
 * If they have their preferences filled out, we will ask them if they want to resume or start a new search.
 * Resume (see: resume_search), Start a new search (see: new_search).
 *
 * If they do not have their preferences filled out, we will prompt them to (see: fill_preferences).
 */

'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

function close(sessionAttributes, fulfillmentState, message) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'Close',
      fulfillmentState,
      message,
    }
  };
}

function elicitIntent(sessionAttributes, message) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'ElicitIntent',
      message,
    }
  };
}

function confirmIntent(sessionAttributes, message, intentName, slots) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'ConfirmIntent',
      message,
      intentName,
      slots,
    }
  };
}

var getUser = function getUser(userId) {
  let find_user_params = {
    TableName: 'users',
    Key: {
      'userId': userId
    }
  };

  return dynamodb.get(find_user_params).promise();
};

// --------------- Events -----------------------

function dispatch(intentRequest, callback) {
  console.log(intentRequest);
  const sessionAttributes = intentRequest.sessionAttributes;

  // We first check if the user has messaged us before.
  getUser(intentRequest.userId).then(function(user){
    if (Object.keys(user).length === 0) {
      console.log('New user found...');
      callback(
        confirmIntent(
          sessionAttributes,
          {
            'contentType': 'PlainText',
            'content': "Hello there! I'm Jobba The Bot and I'm here to help you with your job search." +
            "\nI've noticed that you don't have any preferences set yet. Do you want to set that up now?"
          },
          'FillPreferences',
          {
            'Country': null,
            'City': null,
            'JobKeyword': null,
            'JobType': null,
          }
        )
      );
    } else {
      console.log("User already exists...");
      // The user already messaged us before, we change our greeting.
      callback(
        elicitIntent(
          sessionAttributes,
          {
            'contentType': 'PlainText',
            'content': 'Welcome back! What would you like to do? ' +
              '\nYou can update your search preferences or you can also resume your search, just let me know!'
          }
        )
      );
    }
  });
}

// --------------- Main handler -----------------------

// Route the incoming request based on intent.
// The JSON body of the request is provided in the event slot.
exports.handler = (event, context, callback) => {
  try {
    dispatch(event,
      (response) => {
        callback(null, response);
      });
  } catch (err) {
    callback(err);
  }
};