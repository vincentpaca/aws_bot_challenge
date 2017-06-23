'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

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

var updateUserSearchIndex = function updateUserSearchIndex(userId, index) {
  let update_user_params = {
    TableName: 'users',
    Key: {'userId': userId},
    UpdateExpression: 'set #i = :i',
    ExpressionAttributeNames: {
      '#i': 'readingIndex'
    },
    ExpressionAttributeValues: {
      ':i': index
    }
  };

  return dynamodb.update(update_user_params).promise();
};

// --------------- Events -----------------------

function dispatch(intentRequest, callback) {
  console.log(intentRequest);
  const sessionAttributes = intentRequest.sessionAttributes;

  getUser(intentRequest.userId).then(function (user) {
    if (Object.keys(user).length === 0) {
      console.log('New user found, we redirect to signup!');

      callback(
        confirmIntent(
          sessionAttributes,
          {
            'contentType': 'PlainText',
            'content': "Hello there! I don't seem to have met you before. I'll need you to setup your preferences " +
              "first before I can help! Would you like to do that now?"
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
      console.log("User already exists, so we start reading off the results...");
      console.log(user);

      let userAttributes = user['Item'];
      let searchResults = JSON.parse(userAttributes['searchResults']);

      // does the user have any previous search results?
      if (searchResults.length > 0) {
        // Read the user the job according to the index
        // and then give them the choice to bookmark, or move on to the next job.

        // Check if we have an existing readIndex for the user, if none then we start at the beginning.
        let readingIndex = 0;

        if (userAttributes['readingIndex']) {
          readingIndex = userAttributes['readingIndex'];
        }

        let job_details = searchResults[readingIndex];
        console.log(job_details);

        let message_response = "Title: " + job_details['jobtitle'] +
          "\nCompany: " + job_details['company'] +
          "\nSnippet: " + job_details['snippet'] +
          "\nURL: " + job_details['url'] +
          "\nposted " + job_details['formattedRelativeTime'] +
          "\n" +
          "\nThere are a few things I can do for you: " +
          "\n" +
          "\nI can show you the summary of this job posting," +
          "\n" +
          "\nI can bookmark this job for later," +
          "\n" +
          "\nI can also give you more information about the company," +
          "\n" +
          "\nor I can move on to the next search result. Let me know! :)";

        // We increase the reading index so the next time they resume search, it will read the next in the queue.
        console.log("bumping reading index...");
        readingIndex++;
        updateUserSearchIndex(userAttributes['userId'], readingIndex).catch(console.error.bind(console));

        console.log("trigger intent...");
        callback(
          elicitIntent(
            sessionAttributes,
            {
              'contentType': 'PlainText',
              'content': message_response
            }
          )
        );
      } else {
        // This user doesn't have any searches saved.
        callback(
          confirmIntent(
            sessionAttributes,
            {
              'contentType': 'PlainText',
              'content': "I'm sorry but you don't seem to have an active search. Would you like me to start one now?"
            },
            'StartSearch'
          )
        );
      }
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