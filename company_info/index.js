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

function buildEmployerRatingDisplay(label, rating) {
  return "\n" + label + ": " + rating + "/5";
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

  getUser(intentRequest.userId).then(function (user) {
    // We already know that if this function was invoked, the user's readingIndex was already bumped from the previous
    //   command. We will have to subtract 1 from the current readingIndex to get the job details that
    //   the user really wanted.
    let userAttributes = user['Item'];
    let readingIndex = userAttributes['readingIndex'] - 1;
    let searchResults = JSON.parse(userAttributes['searchResults']);
    let job_details = searchResults[readingIndex];
    let company = job_details['company'];
    let country = userAttributes['country'];

    console.log("Getting job details using index: " + readingIndex);
    console.log(job_details);

    // We build the glassdoor request
    let glassdoorUrl = 'http://api.glassdoor.com/api/api.htm?' +
      'v=' + process.env.GLASSDOOR_API_VERSION +
      '&format=' + process.env.GLASSDOOR_API_FORMAT +
      '&t.p=' + process.env.GLASSDOOR_PARTNER_ID +
      '&t.k=' + process.env.GLASSDOOR_PARTNER_KEY +
      '&userip=' + '0.0.0.0' +
      '&useragent=' + encodeURIComponent(process.env.USER_AGENT) +
      '&action=employers' +
      '&q=' + encodeURIComponent(company);

    request(glassdoorUrl, function (err, response, body) {
      if (err) {
        console.log("Got an error from the Glassdoor API: " + err);
      } else {
        console.log(body);
        let glassdoorResponse = JSON.parse(body)['response'];
        if (glassdoorResponse['totalRecordCount'] === 0) {
          console.log("no results from Glassdoor...");

          callback(
            elicitIntent(
              sessionAttributes,
              {
                'contentType': 'PlainText',
                'content': "I'm sorry but I can't seem to find the company " + company + " on Glassdoor.com. " +
                  "Do you want bookmark this job or move on to the next search result?"
              }
            )
          )
        } else {
          console.log("Got some results from Glassdoor...");

          let employer = glassdoorResponse['employers'][0];
          let employerDetails = "Here's " + company + "'s ratings from Glassdoor.com: " +
            buildEmployerRatingDisplay("Overall Rating", employer['overallRating']) +
            buildEmployerRatingDisplay("Culture and Values", employer['cultureAndValuesRating']) +
            buildEmployerRatingDisplay("Senior Leadership", employer['seniorLeadershipRating']) +
            buildEmployerRatingDisplay("Compensation and Benefits", employer['compensationAndBenefitsRating']) +
            buildEmployerRatingDisplay("Career Opportunities", employer['careerOpportunitiesRating']) +
            buildEmployerRatingDisplay("Work/Life Balance", employer['workLifeBalanceRating']) +
            "\n\n" +
            employer['recommendToFriendRating'] + "% of employees recommend working at " + company + " to their friends." +
            "\n\n" +
            "Here's what people from " + company + " are saying about them:" +
            "\n\n" +
            "PROS: " + employer['featuredReview']['pros'] +
            "\n\n" +
            "CONS: " + employer['featuredReview']['cons'] +
            "\n\n" +
            "You can learn more about " + company + "here: " + glassdoorResponse['attributionURL'] +
            "\n\n" +
            "Do you want bookmark this job or move on to the next search result?";

          console.log(employer);

          // if we're seeing more than one result for a company search, we let the user know
          if (glassdoorResponse['totalRecordCount'] > 1) {
            console.log("Found more than 1 result from Glassdoor...");

            employerDetails = "I'm seeing more than one result when I searched for the company " + company + ", " +
              "So I'm showing you the most relevant one." +
              "\n\n" +
              employerDetails +
              "\n\n" +
              "Did I show you the wrong company? You can find the others here: " + glassdoorResponse['attributionURL']
          }

          console.log("triggering intent...");
          callback(
            elicitIntent(
              sessionAttributes,
              {
                'contentType': 'PlainText',
                'content': employerDetails
              }
            )
          );
        }
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