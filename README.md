# aranea
Bittorrent DHt crawler

The ticky part is based on a variation of the [eclipse attack][1] on the DHT overload network.
The crawler dinamically modifies its ID to be inserted in the neighbor bucket of any node that enters in contatct with him.
Once you are inserted in thousands of buckets you start receiving thousands of announce_peer packets.
Downloading the torrent metadata from these peers is trivial.

Redis for storing temporary data and mongodb for storing torrents retrieved.
---
#todo
toomany things

[1]: http://82.130.102.95/publications/icdcn10_-1_181.pdf
