'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const request = require('request');

function elicitIntent(sessionAttributes, message) {
  return {
    sessionAttributes,
    dialogAction: {
      type: 'ElicitIntent',
      message,
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
    console.log("User already exists, so we start reading off the results...");
    console.log(user);

    let userAttributes = user['Item'];
    let searchResults = JSON.parse(userAttributes['searchResults']);

    // When we're at this point, our readingIndex is definitely non-zero since we came from readResults.
    //   readResults also definitely increased that index to the next item so we do n - 1 here since
    //   we'll be showing the summary for the current job
    let readingIndex = userAttributes['readingIndex'] - 1;
    let job_details = searchResults[readingIndex];

    // By default, let's use the snippet from Indeed as the summary
    let job_summary = job_details['snippet'];

    // but let's try to summarize the entire job posting using the SMMRY API
    let smmyUrl = 'http://api.smmry.com' +
      '?SM_API_KEY=' + process.env.SMMRY_API_KEY +
      '&SM_URL=' + job_details['url'] +
      '&SM_LENGTH=7';

    request(smmyUrl, function (err, response, body) {
      if (err) {
        console.log("Got an error from the SMMRY API: " + err);
      } else {
        // We use SMMRY's summary!
        let smmry_response = JSON.parse(body);
        if (smmry_response['sm_api_content']) {
          job_summary = smmry_response['sm_api_content'];
        }
        console.log('Job Summary:');
        console.log(job_summary);

        let message_response = job_summary +
          "\n" +
          "\n" +
          "\nDo you want me too bookmark this job for you?" +
          "\n" +
          "\nI can also give you more information about the company," +
          "or I can move on to the next search result. Let me know! :)";

        // We increase the reading index so the next time they resume search, it will read the next in the queue.
        console.log("bumping reading index...");
        readingIndex++;
        updateUserSearchIndex(userAttributes['userId'], readingIndex).then(function(){
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
        }).catch(console.error.bind(console));
      }
    });
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