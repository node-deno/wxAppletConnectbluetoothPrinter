// index.js
// 获取应用实例
const app = getApp()
const tspl = require('../../utils/tspl-util')


Page({
  data: {
    bluetoothList: [], //蓝牙列表
    isFoundWirteCharacteristic: false, //是否发现写特征

    isLabelSending: false, //打印指令是否正在发送

    paperWidth: 100, //打印纸宽度
    paperHeight: 50, //打印纸长度

    totalLoopTime: 0, //传输数据需要循环的总次数
    currentLoopTime: 1, //当前次数

    onceDataSize: 20, //给蓝牙设备每次循环传输数据的大小--20字节
    lastDataSize: 0, //最后一次传输数据的大小
  },

  // 搜索蓝牙
  searchBluetooth() {
    wx.openBluetoothAdapter({
      success: success => {
        wx.startBluetoothDevicesDiscovery({
          interval: 100,
          success: success => {
            console.log('开始搜索蓝牙设备')
            wx.onBluetoothDeviceFound(res => {
              let allBluetoothDevices = res.devices

              console.log(this.data.bluetoothList)

              if (!this.data.bluetoothList.length) {
                wx.showLoading({
                  title: '正在搜索',
                })
              } else {
                wx.hideLoading()
              }

              // 如果搜索到的蓝牙设备 name且localName 不存在值的话直接跳过（对应 wx.getBluetoothDevices 接口的 未知设备）
              allBluetoothDevices.forEach(device => {
                if (!device.name && !device.localName) {
                  return
                }

                // 由于wx.onBluetoothDeviceFound 返回的res 是新搜索到的蓝牙，那么就需要将新搜索到的蓝牙存起来，并且还不能重复存储
                const bluetoothList = this.data.bluetoothList
                const bluetoothListIndex = bluetoothList.indexOf(device.deviceId)

                console.log('==================')
                console.log(bluetoothListIndex)
                console.log('==================')


                if (bluetoothListIndex === -1) {
                  bluetoothList.push(device)
                } else {
                  bluetoothList[bluetoothListIndex] = device //如果匹配到了，将数据进行更新
                }
                this.setData({
                  bluetoothList
                })
              })
            })
          },
          fail: fail => {
            console.error('调用startBluetoothDevicesDiscovery API 失败', fail)
          }
        })
      },
      fail: fail => {
        console.error('调用openBluetoothAdapter API 失败', fail)
      }
    })
  },

  // 点击蓝牙设备--连接蓝牙
  tapBluetoothDevice(event) {
    console.log(event)

    wx.showLoading({
      title: '正在连接蓝牙设备',
      icon: 'loading',
      mask: true
    })

    wx.stopBluetoothDevicesDiscovery({
      success: (res) => {
        console.log('=============')
        console.log('停止蓝牙设备搜索')
        console.log('=============')
      },
    })

    // 连接蓝牙设备
    wx.createBLEConnection({
      deviceId: event.currentTarget.dataset.deviceId,
      success: success => {
        console.log('createBLEConnection 连接成功', success)

        app.globalData.bluetooth.deviceId = event.currentTarget.dataset.deviceId

        this.getBluetoothService(app.globalData.bluetooth.deviceId)
      },
      fail: fail => {
        wx.showModal({
          title: '提示',
          content: '连接失败',
          showCancel: false
        })
        console.log(error)
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 获取蓝牙设备服务
  getBluetoothService(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: success => {
        for (let i = 0; i < success.services.length; i++) {
          // 如果找到 write特征，则直接跳出外层循环
          if (this.data.isFoundWirteCharacteristic) {
            return
          }

          // 如果服务是主服务再进行下一步
          if (success.services[i].isPrimary) {
            this.getBluetoothCharacteristic(deviceId, success.services[i].uuid)
          }
        }
      },
      fail: fail => {
        console.log('获取蓝牙服务失败', fail)
      }
    })
  },

  // 获取蓝牙设备特征--根据serviceId和deviceId
  getBluetoothCharacteristic(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: success => {
        for (let i = 0; i < success.characteristics.length; i++) {
          console.log('=========')
          console.log(i, success.characteristics)
          console.log('=========')
          // 我们的需求是只需要向蓝牙设备中写入数据，那么我们的蓝牙设备只要支持写操作即可
          if (success.characteristics[i].properties.write) {
            app.globalData.bluetooth.serviceId = serviceId
            app.globalData.bluetooth.characteristicId = success.characteristics[i].uuid

            this.data.isFoundWirteCharacteristic = true

            wx.showToast({
              title: '蓝牙连接成功',
              icon: 'success',
              duration: 800
            })

            return
          }
        }
      },
      fail: fail => {
        console.log('获取蓝牙特征失败', fail)
      }
    })
  },

  // 向蓝牙设备写入数据
  writeDataToBluetooth() {
    let BLEcommand = tspl.printer.createNew() //创建打印机实例
    BLEcommand.setCls() //清除指令区，防止下一个指令不生效
    BLEcommand.setSize(this.data.paperWidth, this.data.paperHeight) //设置热敏标签纸大小，单位为mm
    BLEcommand.setGap(2) //设置热敏标签纸之间的间隙，单位为mm。正常情况下热敏纸之间间距都为2mm
    BLEcommand.setCls() //再次清除指令区

    // =================接下来是真正我们需要打印的内容=================
    BLEcommand.setText(200, 200, "TSS24.BF2", 0, 1, 1, "我是China人") //绘制文字，具体参数看文档或者tspl-util.js文件
    BLEcommand.setQrcode(0, 0, "L", 8, "A", "https://www.baidu.com") //绘制二维码，具体参数看文档或者tspl-util.js文件

    BLEcommand.setPagePrint() //打印存储于影像缓冲区内的数据

    if (this.data.isLabelSending) { //如果指令正在执行则直接return
      return
    }

    this.setData({
      isLabelSending: true
    })

    this.prepareDataForBLE(BLEcommand.getData()) //将指令转化为buff格式的数据传递给下一个函数
  },

  // 准备给蓝牙设备的数据
  prepareDataForBLE: function (buff) {
    let totalLoopTime = parseInt(buff.length / this.data.onceDataSize)
    let lastDataSize = buff.length % this.data.onceDataSize

    this.setData({
      totalLoopTime: lastDataSize ? totalLoopTime : totalLoopTime + 1,
      lastDataSize: lastDataSize,
      currentLoopTime: 1
    })

    this.sendDataToBLE(buff)
  },

  // 发送数据给蓝牙设备
  sendDataToBLE(buff) {
    let that = this

    let currentLoopTime = this.data.currentLoopTime //当前在循环中的次数
    let totalLoopTime = this.data.totalLoopTime //循环总数
    let onceDataSize = this.data.onceDataSize //循环一次传输数据的字节数--20
    let lastDataSize = this.data.lastDataSize //最后一次循环传输数据的字节数

    let currentBLEValue //创建此次给蓝牙设备发送的数据
    let dataView //创建dataView是为了操作ArrayBuffer格式的数据

    if (totalLoopTime > currentLoopTime) {
      currentBLEValue = new ArrayBuffer(onceDataSize) //创建大小为20Byte
      dataView = new DataView(currentBLEValue) //创建可以操作currentBLEValue的dataView

      for (let i = 0; i < onceDataSize; i++) { //将本次循环的数据给currentBLEValue赋值
        dataView.setUint8(i, buff[currentLoopTime * onceDataSize + i]) //PS:这里使用setUint8是因为encoding.js将字符都转化为了此格式
      }
    } else {
      currentBLEValue = new ArrayBuffer(lastDataSize)
      dataView = new DataView(currentBLEValue)

      for (let i = 0; i < lastDataSize; i++) {
        dataView.setUint8(i, buff[currentLoopTime * onceDataSize + i])
      }
    }

    /*     currentBLEValue = new ArrayBuffer(buff.length)
        dataView = new DataView(currentBLEValue)
        for (let i = 0; i < buff.length; i++) {
          dataView.setUint8(i, buff[i])
        } */


    wx.writeBLECharacteristicValue({
      characteristicId: app.globalData.bluetooth.characteristicId,
      deviceId: app.globalData.bluetooth.deviceId,
      serviceId: app.globalData.bluetooth.serviceId,
      value: currentBLEValue,
      success: (success) => {
        console.log('打印成功')
      },
      fail: (fail) => {
        console.log('打印失败')
        console.log(fail)
      },
      complete: () => {
        currentLoopTime++

        if (currentLoopTime < totalLoopTime || (currentLoopTime == totalLoopTime && lastDataSize)) {
          this.setData({
            currentLoopTime: currentLoopTime
          })
          that.sendDataToBLE(buff) //进行递归循环调用
        } else {
          this.setData({
            totalLoopTime: 0,
            lastDataSize: 0,
            currentLoopTime: 1,
            isLabelSending: false,
          })
        }

      }
    })

  },

})