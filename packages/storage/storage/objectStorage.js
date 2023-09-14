import { capitalize } from '../../util.js'

export function createAPIs ({ buckets }, { objects }) {
  const apis = {}

  objects.forEach(({ bucket: bucketName, name: objectType, makePath }) => {
    apis[`sign${capitalize(objectType)}`] = function (rawFileName, payload, options) {
      const bucket = buckets[bucketName]
      const fileName = makePath(rawFileName, payload, this)
      const uploadURL = bucket.pen.signatureUrl(fileName, options)

      return {
        uploadURL,
        downloadURL: `https://${bucket.bucket}.${bucket.region}.${bucket.domain}${fileName}`
      }
    }
  })

  return apis
}
