// Credits to M4GNV5 for this library

import net from 'net'

class Rcon {
  socket: net.Socket
  timeout: number
  nextId: number

  connected: boolean
  authed: boolean
  debug: boolean

  ip: string
  port: number

  packages: any

  constructor (ip: string, port: number, debug: boolean) {
    this.ip = ip
    this.port = port
    this.debug = debug

    this.timeout = 5000
    this.nextId = 0
    this.connected = false
    this.authed = false
    this.packages = []

    this.socket = net.connect(port, ip, () => {
      this.connected = true
      console.log('[INFO] Authenticated with ' + ip + ':' + port)
    })

    this.socket.on('data', (data) => {
      const id = data.readInt32LE(4)
      const type = data.readInt32LE(8)
      const response = data.toString('ascii', 12, data.length - 2)

      if (this.packages[id]) {
        this.packages[id](type, response)
      } else {
        console.log('Unexpected rcon response', id, type, response)
      }
    }).on('end', () => {
      if (debug) {
        console.log('[DEBUG] Rcon closed!')
      }
    })
  }

  close () {
    this.connected = false
    this.socket.end()
  }

  async auth (password: string) {
    if (this.authed) { throw new Error('Already authed') }

    if (this.connected){
      await this.sendPackage(3, password)
    } else {
      return new Promise(resolve => {
        this.socket.on('connect', async () => {
          await this.sendPackage(3, password)
          resolve()
        })
      })
    }
  }

  command (cmd: string) {
    return this.sendPackage(2, cmd)
  }

  sendPackage (type: number, payload: string) {
    const id = this.nextId
    this.nextId++

    if (!this.connected) { throw new Error('Cannot send package while not connected') }

    const length = 14 + payload.length
    const buff = Buffer.alloc(length)
    buff.writeInt32LE(length - 4, 0)
    buff.writeInt32LE(id, 4)
    buff.writeInt32LE(type, 8)

    buff.write(payload, 12)
    buff.writeInt8(0, length - 2)
    buff.writeInt8(0, length - 1)

    this.socket.write(buff)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete this.packages[id]
        return reject('Server sent no request in ' + this.timeout / 1000 + ' seconds')
      }, this.timeout)

      this.packages[id] = (type: number, response: any) => {
        clearTimeout(timeout)
        const err = type >= 0 ? false : 'Server sent package code ' + type
        if (this.debug) {
          console.log('[DEBUG] Received response: ' + response)
        }
        if (err) return reject(err)
        return resolve(response)
      }
    })
  }
}

export default Rcon
