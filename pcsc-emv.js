var pcsclite = require('pcsclite');
var emv = require('node-emv');

var pcsc = pcsclite();

var reader;

// --- start public interface methods ---

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

function readMaestro() {
    return connectReader().then(protocol =>
        // SELECT AID MAESTRO: '00A4040007A000000004306000'
        sendAndReceive(protocol, '00A4040007A000000004306000')
        .then(data => {
                // EC
            return readRecord(protocol, 1, 3, 4);
        })
        .then(tag57 => {
            if (tag57) {
                return tag57;
            } else {
                // try another one:
                return readRecord(protocol, 2, 1, 6);
            }
        })
        .then(tag57 => {
            disconnectReader();
            return tag57;
        })
    );
}

function createTAN(flickercode) {
    // See https://wiki.ccc-ffm.de/projekte:tangenerator:start

    // Parse the flickercode (assume it always consists
    // of the startcode and two other fields for Kontonummer and Betrag)
    let parseIx = 4; // LL04
    let len = 8;
    let startcode = flickercode.substr(parseIx,len);
    parseIx += len;
    parseIx++; // assume BCD for Kontonummer
    len = parseInt(flickercode[parseIx++]) * 2;
    let kontonummer = flickercode.substr(parseIx,len);
    parseIx += len;
    parseIx++; // assume ASCII for Betrag
    len = parseInt(flickercode[parseIx++]) * 2;
    let betrag = Buffer.from(flickercode.substr(parseIx,len), 'hex').toString('ASCII');

    console.log("startcode=" + startcode + ", kontonummer=" + kontonummer + ", betrag=" + betrag);

    // Now, assemble the core data for the HASH call later
    let hashData = [];

    hashData.push(0xE1); // DIN-66003
    hashData.push(...Buffer.from('Start-Code:', 'ASCII'));

    hashData.push(0xE0); // BCD
    hashData.push(...Buffer.from(startcode, 'hex'));

    hashData.push(0xE1); // DIN-66003
    hashData.push(...Buffer.from('Kontonummer', 'ASCII'));

    hashData.push(0xE1); // DIN-66003
    hashData.push(...Buffer.from(kontonummer, 'ASCII'));

    hashData.push(0xE1); // DIN-66003
    hashData.push(...Buffer.from('Betrag', 'ASCII'));

    hashData.push(0xE1); // DIN-66003
    hashData.push(...Buffer.from(betrag, 'ASCII'));

    hashData.push(0xB6); // B0 + 6 = B6 (6 Felder)

//    console.log(Buffer.from(hashData).toString('hex'));

    let cardNo;
    let ipb;

    return connectReader().then(protocol =>

        // SELECT FILE AID TAN ANWENDUNG 'D27600002554440100'
        // AID: D2 76 00 00 25 54 44 01 00
        // RID: D2 76 00 00 25
        //      D: "national registration"
        //       2 76: ISO 3166 Country Code Deutschland
        //            00 00 25: ZKA?
        // PIX:                54 44 01 00: TAN Anwendung DF_TAN
        sendAndReceive(protocol, '00A4040C09D27600002554440100').then(data =>

        // GET PROCESSING OPTIONS
        sendAndReceive(protocol, '80A8000002830000')).then(data =>

        // READ RECORD (read card data)
        sendAndReceive(protocol, '00B201BC00')).then(data => {
            // die letzten beiden Ziffern der Kurz-BLZ plus die 10-stellige Karten-Nr. MM NN NN NN NN NN
            cardNo = data.toString('hex').substr(6, 12);
        }).then(() =>

        // SEARCH RECORD IPB (search for '9F56' - Issuer Proprietary Bitmap)
        sendAndReceive(protocol, '00A2010F090400CE9F56000000FF00')).then(data => {
            // IPB
            ipb = data.toString('hex').substr(20, 36);
        }).then(() =>

        // SEARCH RECORD CDOL (SECCOS ab 6.0) (search for '8C' - CDOL)
        sendAndReceive(protocol, '00A2010F080400CE8C000000FF00')).then(data =>

        // VERIFY
        sendAndReceive(protocol, '00200081082C' + cardNo + 'FF')).then(data =>

        // HASH
        sendAndReceive(protocol, '002A90A0' + hexChar(hashData.length+5) + '90008081' + hexChar(hashData.length) + Buffer.from(hashData).toString('hex') + '00')).then(hash =>

        // GENERATE AC (SECCOS vor 6.0)
        sendAndReceive(protocol, '80AE00002B0000000000000000000000008000000000099900000000' + hash.toString('hex').substr(0,8) + '0000000000000000000020800000003400')).then(data => {
            
            if (data.length < 10) {
                // XXX Secoder Firewall blocks, use dummy data:
                return '771E9F2701009F360201029F2608ECF50D2C1EAF4EE29F1007038201003100009000';
            } else {
                return data.toString('hex');
            }
        }).then(data =>
        
        // Nutzdaten parsen
        emvParse(data.substr(4)).then(emvData => {

            let acData = "";
            emvData.forEach(tag => acData += tag.value);
            console.log("GENERATE AC DATA " + acData);

            let dataBin = bufToBitString(Buffer.from(acData, 'hex'));
            let ipbMask = bufToBitString(Buffer.from(ipb, 'hex'));
            let usedBits = "";

            console.log("DATA = " + dataBin);
            console.log("IPB  = " + ipbMask);
            for (var i=0; i<ipbMask.length; i++) if (ipbMask[i] == '1') usedBits += dataBin[i];
            console.log("RES  = " + usedBits);
            usedBits = usedBits.substr(8) + usedBits.substr(0,8);
            console.log("SHIFT= " + usedBits);
            let tan = parseInt(usedBits, 2);
            console.log("TAN  = " + tan);

            disconnectReader();
            return tan;
        }))
    );
}

// --- end public interface methods --

function connectReader() {
    //console.log("EXCLUSIVE: " + reader.SCARD_SHARE_EXCLUSIVE);
    //console.log("SHARED: " + reader.SCARD_SHARE_SHARED);
    return new Promise(function(resolve, reject) {
        reader.connect({ share_mode : reader.SCARD_SHARE_SHARED }, function(err, protocol) {
            if (err || !protocol) { console.log(err); reject(err); }
            resolve(protocol);
        });
    });
}

function disconnectReader() {
    reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {});
}

function findEmvTag(emvData, tagName) {
    var found;
    emvData.forEach(function(tag) {
        if (tag.tag == tagName) found=tag;
    });
    return found;
}

function sendAndReceive(protocol, data) {
    return new Promise(function(resolve, reject) {
        console.log('>>>', data);
        reader.transmit(new Buffer(data,'hex'), 512, protocol, function(err, data) {
            if (err) {
                console.log(err); 
                reject(err);
            } else {
                console.log('<<<', data.toString('hex'));
                resolve(data);
            }
        });
    });
}

function readRecord(protocol, sfi, rec, offset) {
    return sendAndReceive(protocol, '00B2'+hexChar(rec)+hexChar((sfi << 3) | 4)+'00')
    .then(data => emvParse(data.toString('hex').substr(offset)))
    .then(emvData => {
        if (emvData != null) {
            console.log(emvData);
            return findEmvTag(emvData, '57');
        }
    });
}

function emvParse(data) {
    return new Promise(function(resolve, reject) {
        emv.parse(data, emvData => resolve(emvData));
    });
}

function hexChar(x) {
    return ('0'+x.toString(16)).substr(-2);
}

function binChar(x) {
    return ('0000000' + x.toString(2)).substr(-8);
}

function bufToBitString(buf) {
    let result = '';
    for (var i=0; i<buf.length; i++) result += binChar(buf[i]);
    return result;
}

// -------------- THE FOLLOWING IS FOR TESTING ONLY ------------

function dumpNext(protocol, sfi, rec, maxSfi, maxRec) {
    if (rec == 1) console.log("SFI " + sfi);
    sendAndReceive(protocol, '00B2'+hexChar(rec)+hexChar((sfi << 3) | 4)+'00').then(data => {
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
    reader.connect({ share_mode : reader.SCARD_SHARE_SHARED }, function(err, protocol) {
        if (err) console.log(err); 
        else {
            console.log('Protocol(', reader.name, '):', protocol);
            // SELECT DFNAME
            sendAndReceive(protocol, '00A40400' + hexChar(dfname.length/2) + dfname +'00').then(data => {
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
module.exports.createTAN = createTAN;
