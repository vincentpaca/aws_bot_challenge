'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const request = require('request');
const iso3166 = require('iso-3166-2');
const xmlParser = require('xml2js').parseString;

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

var updateUserSearchResults = function updateUser(userId, searchResults) {
  console.log(searchResults);

  let update_user_params = {
    TableName: 'users',
    Key: { 'userId': userId },
    UpdateExpression: 'set #sr = :sr',
    ExpressionAttributeNames: {
      '#sr': 'searchResults'
    },
    ExpressionAttributeValues: {
      ':sr': JSON.stringify(searchResults)
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
            'content': "Heya! Before we can start searching, we need to setup your preferences first! " +
            "Would you like to do that now?"
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
      console.log("User already exists, so we start the search...");
      console.log(user);

      let userAttributes = user['Item'];
      let country = userAttributes['country'];
      let city = userAttributes['city'];
      let keywords = userAttributes['keywords'];
      let jobType = userAttributes['jobType'];

      // let glassdoor_url = 'http://api.glassdoor.com/api/api.htm?' +
      //   't.p=' + process.env.GLASSDOOR_PARTNER_ID +
      //   '&t.k=' + process.env.GLASSDOOR_PARTNER_KEY +
      //   '&userip=' + '0.0.0.0' +
      //   '&useragent=' + encodeURIComponent(process.env.USER_AGENT) +
      //   '&format=' + process.env.GLASSDOOR_API_FORMAT +
      //   '&v=' + process.env.GLASSDOOR_API_VERSION +
      //   '&action=jobs-stats' +
      //   '&q=' + encodeURIComponent(keywords) +
      //   '&jobType=' + encodeURIComponent(jobType) +
      //   '&country=' + encodeURIComponent(country) +
      //   '&city=' + encodeURIComponent(city)

      let locationString = encodeURIComponent(country);
      if (!['none', 'no', 'nope'].includes(city))
        locationString = city + ', ' + locationString;

      let indeedUrl = 'http://api.indeed.com/ads/apisearch?' +
        'publisher=' + process.env.INDEED_PUBLISHER_ID +
        '&v=' + process.env.INDEED_API_VERSION +
        '&q=' + encodeURIComponent(keywords) +
        '&l=' + encodeURIComponent(locationString) +
        '&jt=' + encodeURIComponent(jobType) +
        '&co=' + iso3166.country(country)['code'] +
        '&userip=' + '0.0.0.0' +
        '&useragent=' + encodeURIComponent(process.env.USER_AGENT);

      request(indeedUrl, function (err, response, body) {
        if (err) {
          console.log(err);
        } else {
          xmlParser(body, function (err, result) {
            let jobResultsJson = result['response']['results'][0]['result'];
            let totalResults = result['response']['totalresults'];

            if (jobResultsJson) {
              console.log('We found a couple of jobs...yay! Updating the user...');

              updateUserSearchResults(userAttributes['userId'], jobResultsJson)
                .then(function (data) {
                  callback(
                    confirmIntent(
                      sessionAttributes,
                      {
                        'contentType': 'PlainText',
                        'content': "I've found " + totalResults + " jobs for you but I've reduced that " +
                          "to the top " + jobResultsJson.length + " results. Would you like me to start giving you " +
                          "the details for the first one?"
                      },
                      'ReadResults'
                    )
                  );
                }).catch(console.error.bind(console));
            } else {
              console.log("We couldn't find any jobs :( Search again?");
              callback(
                confirmIntent(
                  sessionAttributes,
                  {
                    'contentType': 'PlainText',
                    'content': "I'm sorry but I can't find any " + jobType + " " + keywords + " jobs " +
                    "in " + country + ". Would you like to update your search preferences instead?"
                  },
                  'FillPreferences'
                )
              );
            }
          });
        }
      });
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