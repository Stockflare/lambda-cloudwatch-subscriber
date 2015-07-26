exports.handler = function (event, context) {

  console.log("REQUEST RECEIVED:\n", JSON.stringify(event));

  try {
    var oldProperties = event.OldResourceProperties;
    var properties = event.ResourceProperties;
    if(validateProperties(properties)) {
      var aws = require("aws-sdk");
      var logs = new aws.CloudWatchLogs({ region: properties.Region });

      switch(event.RequestType) {
        case "Delete":
          subscription.delete(logs, properties, function(err) {
            if(err) console.log(err, err.stack);
            sendResponse(event, context, "SUCCESS", {});
          });
          break;
        case "Update":
          subscription.delete(logs, oldProperties, function() {
            subscription.create(logs, properties, function(err) {
              if(err) {
                sendResponse(event, context, "ERROR", { reason: err.stack });
              } else {
                console.log("Updated Subscription: " + properties.Stream);
                sendResponse(event, context, "SUCCESS", {});
              }
            });
          });
          break;
        case "Create":
          subscription.create(logs, properties, function(err) {
            if(err) {
              sendResponse(event, context, "ERROR", { reason: err.stack });
            } else {
              console.log("Created Subscription: " + properties.Stream);
              sendResponse(event, context, "SUCCESS", {});
            }
          });
          break;
        default:
          throw "received unexpected request type (" + event.RequestType + ")";
      }
    }
  } catch(e) {
    sendResponse(event, context, "ERROR", { reason: e });
  }
};

var subscription = {

  create: function(logs, properties, fn) {
    var params = {
      destinationArn: properties.Stream,
      filterName: properties.Name,
      filterPattern: properties.Pattern,
      logGroupName: properties.LogGroup,
      roleArn: properties.Role
    };
    console.log("Creating Subscription Filter: " + properties.Stream);
    logs.putSubscriptionFilter(params, fn);
  },

  delete: function(logs, properties, fn) {
    var params = {
      filterName: properties.Name,
      logGroupName: properties.LogGroup
    };
    console.log("Deleting Subscription Filter: " + properties.Stream);
    logs.deleteSubscriptionFilter(params, fn);
  }

};

var validateProperties = function(properties) {
  var keys = ['LogGroup', 'Name', 'Pattern', 'Role', 'Stream', 'Region'];
  for(var i in keys) {
    if( ! properties[keys[i]]) throw "Missing " + keys[i] + " Property.";
  }
  return true;
};

//Sends response to the pre-signed S3 URL
var sendResponse = function(event, context, responseStatus, responseData) {
   var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: responseData.reason || "See the details in CloudWatch Log Stream: " + context.logStreamName,
        PhysicalResourceId: context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    console.log("RESPONSE BODY:\n", responseBody);

    var https = require("https");
    var url = require("url");

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: "PUT",
        headers: {
            "content-type": "",
            "content-length": responseBody.length
        }
    };

    var request = https.request(options, function(response) {
        console.log("STATUS: " + response.statusCode);
        console.log("HEADERS: " + JSON.stringify(response.headers));
        context.done();
    });

    request.on("error", function(error) {
        console.log("sendResponse Error:\n", error);
        context.done();
    });

    // write data to request body
    request.write(responseBody);
    request.end();
};
