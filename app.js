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
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        notifier.addObserver('status', function(arg) {
            res.send(arg);
        });
    }
});

app.get('/card', function(req, res) {
    if (!pcsc.getReader()) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.5s
//        setTimeout(function() {
        pcsc.readMaestro(function(tag57) {
            if (tag57) {
                res.send({
                    blz:   tag57.value.substr(0,8),
                    ktonr: tag57.value.substr(8,10)
                });
            } else {
                res.send({
                    blz:   "Nicht gefunden",
                    ktonr: "Nicht gefunden"
                });
            }
        })
        // WINDOWS PLATFORM ONLY, ADD ARTIFICIAL DELAY OF 0.5s
//        }, 500);
    }
});
