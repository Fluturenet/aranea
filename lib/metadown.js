var utp = require('utp-native')
var Protocol = require('bittorrent-protocol')
var ut_metadata = require('ut_metadata')
var bencode = require("bencode")
var debug = require("debug")("metadown")

function download(p,cb){
var socket = utp.connect(p.port,p.address)
var wire = new Protocol()
socket.pipe(wire).pipe(socket)
wire.use(ut_metadata())
wire.handshake(p.hash,p.hash)
wire.ut_metadata.fetch()

wire.ut_metadata.on('metadata', function (metadata) {
debug(bencode.decode(metadata).info.name.toString('utf-8'))
socket.destroy()
cb(metadata)
})

  wire.ut_metadata.on('warning', function (err) {
    debug(err.message)
    socket.destroy()
  })

socket.on('error', function (data) {
      //console.log('echo: ' + data)
      socket.destroy()
})
}

module.exports=download
