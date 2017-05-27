"use strict"

var Emitter = require('events')
var Protocol = require('bittorrent-protocol')
var net = require('net')
var ut_metadata = require('ut_metadata')
var crypto = require("crypto")
var bencode = require("bencode")
var bitField = require("bitfield")

const config = require("../config.js")
const database = require("./database")
const debug = require("debug")("HoneyPot")


class HoneyPot extends Emitter {
    constructor() {
        super()
        this.id = new Buffer.concat([new Buffer.from("ARANEA"),crypto.randomBytes(14)]).toString('hex')
        this.db = new database()
        debug("new worker")
    }

    listen(port){

        var server = net.createServer((socket) => this.newIncoming(socket))
        server.listen(port)
        }

    newIncoming(socket) {
          var wire = new Protocol()
          socket.pipe(wire).pipe(socket)
          var iHash
          var id = this.id
          //
          // initialize the extension
          wire.use(ut_metadata())

          // all `ut_metadata` functionality can now be accessed at wire.ut_metadata

          // ask the peer to send us metadata
          wire.ut_metadata.fetch()

          // 'metadata' event will fire when the metadata arrives and is verified to be correct!
          wire.ut_metadata.on('metadata', (metadata) =>{
            // got metadata!

            // Note: the event will not fire if the peer does not support ut_metadata, if they
            // don't have metadata yet either, if they repeatedly send invalid data, or if they
            // simply don't respond.
            this.emit("gotMetadata",iHash,bencode.decode(metadata))
            socket.destroy()
            debug(`gotMetadata ${iHash}`)
            this.db.cacheMetadata(metadata)
            this.db.gotMetadata(iHash)
          })

          // optionally, listen to the 'warning' event if you want to know that metadata is
          // probably not going to arrive for one of the above reasons.
          wire.ut_metadata.on('warning', function (err) {
            debug(err.message)
            socket.destroy()
          })

          // handle handshake
          wire.on('handshake', (infoHash, peerId) =>{
            // receive a handshake (infoHash and peerId are hex strings)
            debug(`handshake ${infoHash} ${peerId}`)
            this.db .interested(infoHash,(ret)=>{
                    if(!ret){
                        wire.bitfield(new bitField(1))
                        socket.destroy();
                        return}
                    debug(`interested on: ${infoHash}`)
                    wire.handshake(infoHash, id)
                    iHash=infoHash;
                    this.db.isInterest
                    this.emit("newConn",infoHash,socket)
                })
          })

          socket.on("error",function(e){
            //console.log(e.message)
            })
    }
}

const honeyPot = new HoneyPot()

honeyPot.listen(config.torrentPort)
