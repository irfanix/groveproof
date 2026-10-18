# Sample forest check, 2026-10-18 19:00

Blockchain connected: yes

## Nallamala hills forest (should be Verified)
  land: moved +0.016 lon, +0.000 lat (old square holds registered land)
    Nov to Jan: Verified: forest 246.5 ha, loss 0.0%, clear 100.0%, credits 734 (21 s)  <- matches
  -> fixed: Nov to Jan, saved result 964e0a055aee4c97

## Seshachalam hills forest (should be Verified)
  land: unchanged
    Nov to Jan: Verified: forest 264.37 ha, loss 0.0%, clear 98.3%, credits 839 (41 s)  <- matches
  -> fixed: Nov to Jan, saved result e6331ad2d51dd506

## Papikonda hills forest (should be Verified)
  land: unchanged
    Nov to Jan: Verified: forest 260.9 ha, loss 0.01%, clear 100.0%, credits 828 (25 s)  <- matches
  -> fixed: Nov to Jan, saved result 40e68287992cc7ef

## Same forest, monsoon dates (should be CantCheckYet)
    early July: CantCheckYet: forest 3.44 ha, loss 86.76%, clear 14.6%, credits 0 (10 s)  <- matches
  -> fixed: early July, saved result 880490bfa784e0a8

## Overlapping claim (should be AlreadyClaimed)
  could not read GP-1 from the blockchain ({'code': -32701, 'message': 'exceed maximum block range: 10000'})

## Summary
Still wrong: Overlapping claim

# Sample forest check, 2026-10-18 19:13

Blockchain connected: yes

## Overlapping claim (should be AlreadyClaimed)
  placed over GP-1: 1 of 22 map cells already belong to GP-1  <- matches

## Summary
All samples now show what they promise.
