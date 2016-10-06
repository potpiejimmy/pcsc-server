var pcsclite = require('pcsclite');
var emv = require('node-emv');

var pcsc = pcsclite();

var reader;

function registerReader(onCardInserted, onCardRemoved) {
    pcsc.on('reader', function(r) { 
        console.log('New reader detected', r.name);
        reader = r;

        r.on('status', function(status) {
            var changes = this.state ^ status.state;
            if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
                console.log("card removed"); /* card removed */
                reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
                onCardRemoved();
            } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                console.log("card inserted"); /* card inserted */
                onCardInserted();
                // for testing:
//                dumpMaestro();
            }
        });
    });
}

function getReader() {
    return reader;
}

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

function readMaestro(callback) {
    reader.connect({ share_mode : this.SCARD_SHARE_SHARED }, function(err, protocol) {
        if (err || !protocol) { console.log(err); callback(); } 
        else {
            // SELECT AID MAESTRO: '00A4040007A000000004306000'
            sendAndReceive(protocol, '00A4040007A000000004306000', function(data) {
                // EC
                readRecord(protocol, 1, 3, 4, function(tag57) {
                    if (tag57) {
                        reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
                        callback(tag57);
                    } else {
                        // try another one:
                        readRecord(protocol, 2, 1, 6, function(tag57) {
                            reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
                            callback(tag57);
                        });
                    }
                })

            });
        }
    });
}

function readRecord(protocol, sfi, rec, offset, callback) {
    sendAndReceive(protocol, '00B2'+hexChar(rec)+hexChar((sfi << 3) | 4)+'00', function(data) {
        emv.parse(data.toString('hex').substr(offset), function(emvData) {
            if (emvData != null) {
                console.log(emvData);
                callback(findEmvTag(emvData, '57'));
            } else {
                callback(null);
            }
        });
    });
}

function hexChar(x) {
    return ('0'+x.toString(16)).substr(-2);
}

// -------------- THE FOLLOWING IS FOR TESTING ONLY ------------

function dumpNext(protocol, sfi, rec, maxSfi, maxRec) {
    if (rec == 1) console.log("SFI " + sfi);
    sendAndReceive(protocol, '00B2'+hexChar(rec)+hexChar((sfi << 3) | 4)+'00', function(data) {
        if (sfi == maxSfi && rec == maxRec) {
            reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
        } else {
            if (rec == maxRec) {rec = 1; sfi++;} else rec++;
            dumpNext(protocol, sfi, rec, maxSfi, maxRec);
        }
    });
}

function dumpPSE() {
    // SELECT 1PAY.SYS.DDF01 or 2PAY.SYS.DDF01 (contactless)
    dumpAll(new Buffer("1PAY.SYS.DDF01", 'ASCII').toString('hex'));
}

function dumpMaestro() {
    dumpAll("A0000000043060");
}

function dumpAll(dfname) {
    reader.connect({ share_mode : this.SCARD_SHARE_SHARED }, function(err, protocol) {
        if (err) console.log(err); 
        else {
            console.log('Protocol(', reader.name, '):', protocol);
            // SELECT DFNAME
            sendAndReceive(protocol, '00A40400' + hexChar(dfname.length/2) + dfname +'00', function(data) {
                // READ ALL
                dumpNext(protocol, 1, 1, 3, 16);
            });
        }
    });
}

// ----------------------------------------

module.exports.getReader = getReader;
module.exports.registerReader = registerReader;
module.exports.readMaestro = readMaestro;
