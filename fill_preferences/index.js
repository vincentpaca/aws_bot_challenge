/*
 * This class registers and updates the user's search preferences
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
    },
  };
}

function elicitIntent(sessionAttributes, message) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'ElicitIntent',
      message,
    },
  };
}

function confirmIntent(sessionAttributes, message, intentName, slots) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'ConfirmIntent',
      message,
      intentName,
      slots
    }
  }
}

var createUser = function createUser(userObj) {
  let create_user_params = {
    TableName: 'users',
    Item: userObj
  };

  return dynamodb.put(create_user_params).promise();
};

// --------------- Events -----------------------

function dispatch(intentRequest, callback) {
  console.log(intentRequest);
  const sessionAttributes = intentRequest.sessionAttributes;
  const slots = intentRequest.currentIntent.slots;
  const country = slots.Country;
  const city = slots.City;
  const keywords = slots.JobKeyword;
  const jobType = slots.JobType;

  // We first check if the user has messaged us before.
  let user = {
    'userId': intentRequest.userId,
    'country': country,
    'city': city,
    'keywords': keywords,
    'jobType': jobType
  };

  console.log('creating new user...');
  console.log(user);

  createUser(user)
    .then(function (data) {
      callback(
        confirmIntent(
          sessionAttributes,
          {
            'contentType': 'PlainText',
            'content': "Awesome! I'll remember those for you the next time you message me again." +
              "\n\nSo... Would you like to start your search now?"
          },
          'StartSearch'
        )
      );
    }).catch(console.error.bind(console));
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