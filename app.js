var express = require('express');

var pcsc = require('./pcsc-emv');
var Notifier = require('./notifier');

var app = express();
var notifier = new Notifier();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.listen(3004, function () {
  console.log('Startup complete. Listening on port 3004.');
});

pcsc.registerReader(
    function() {
        notifier.notifyObservers('status',
        {"severity":"success", "summary":"Status", "detail":"Card inserted."});
    },
    function() {
        notifier.notifyObservers('status',
        {"severity":"warn", "summary":"Status", "detail":"Card removed."});
    }
);

app.get('/status', function(req, res) {
    console.log('GET STATUS');
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        notifier.addObserver('status', function(arg) {
            res.send(arg);
        });
    }
});

app.get('/card', function(req, res) {
    console.log('GET CARD');
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        // if not reading already, start reading of card:
        if (!notifier.getObservers('card')) {
            // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.75s
            setTimeout(function() {
            pcsc.readMaestro(function(tag57) {
                notifier.notifyObservers('card', tag57);
            });
            // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.75s
            }, 750);
        }

        // add observer for card reading result
        notifier.addObserver('card', function(tag57) {
            if (tag57) {
                res.send({
                    routingcode:  tag57.value.substr(3,5),
                    branch:       tag57.value.substr(5,3),
                    account:      tag57.value.substr(8,10),
                    shortaccount: tag57.value.substr(9,7),
                    subaccount:   tag57.value.substr(16,2),
                });
            } else {
                res.send({});
            }
        });
    }
});
