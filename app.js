var express = require('express');
var pcsclite = require('pcsclite');
var emv = require('node-emv');

var Notifier = require('./notifier');

var app = express();
var pcsc = pcsclite();

var reader;
var notifier = new Notifier();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.listen(3004, function () {
  console.log('Startup complete. Listening on port 3004.');
});

pcsc.on('reader', function(r) { 
    console.log('New reader detected', r.name);
    reader = r;

    r.on('status', function(status) {
        var changes = this.state ^ status.state;
        if (changes) {
            if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
                console.log("card removed"); /* card removed */
                reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
                notifier.notifyObservers('status',
                  {"severity":"warn", "summary":"Status", "detail":"Card removed."});
            } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                console.log("card inserted"); /* card inserted */
                notifier.notifyObservers('status',
                  {"severity":"success", "summary":"Status", "detail":"Card inserted."});

                // for testing:
//                readData(function(data){});
            }
        }
    });
});

app.get('/status', function(req, res) {
    if (!reader) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        notifier.addObserver('status', function(arg) {
            res.send(arg);
        });
    }
});

app.get('/card', function(req, res) {
    if (!reader) res.send({"severity":"error", "summary":"Error", "detail":"Card reader not connected."});
    else {
        readData(function(data) {
            emv.parse(data.substr(4), function(emvData){
                if (emvData != null) {
                    console.log(emvData);
                    var tag57 = findEmvTag(emvData, '57');
                    if (tag57) {
                        res.send({
                            blz:   tag57.value.substr(0,8),
                            ktonr: tag57.value.substr(8,10)
                        });
                    } else {
                        res.send({
                            blz:   "Wirecard Bank",
                            ktonr: "1234567890"
                        });
                    }
                } else {
                    res.send("Sorry, could not parse");
                }
            });
        })
    }
});

function findEmvTag(emvData, tagName) {
    var found;
    emvData.forEach(function(tag) {
        if (tag.tag == tagName) found=tag;
    });
    return found;
}

function sendAndReceive(protocol, data, callback) {
    reader.transmit(new Buffer(data,'hex'), 512, protocol, function(err, data) {
        if (err) console.log(err);
        else {
            console.log('Data received', data.toString('hex'));
            callback(data);
        }
    });
}

function readData(callback) {
    reader.connect({ share_mode : this.SCARD_SHARE_SHARED }, function(err, protocol) {
        if (err) console.log(err); 
        else {
            console.log('Protocol(', reader.name, '):', protocol);
            // SELECT AID MAESTRO: '00A4040007A000000004306000'
            sendAndReceive(protocol, '00A4040007A000000004306000', function(data) {
                // READ_RECORD: '00B2020C00'
                sendAndReceive(protocol, '00B2030C00', function(data) {
                    callback(data.toString('hex'));
                    reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
                });
            });
        }
    });
}