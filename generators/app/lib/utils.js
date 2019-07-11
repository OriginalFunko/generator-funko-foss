const path = require('path')

module.exports = (thisObj, prefix) => ({
  file: fileName => thisObj.fs.copy(
    thisObj.templatePath(prefix ? path.join(prefix, fileName) : fileName),
    thisObj.destinationPath(fileName),
  ),
  dotfile: fileName => thisObj.fs.copy(
    thisObj.templatePath(prefix ? path.join(prefix, fileName) : fileName),
    thisObj.destinationPath('.' + fileName),
  ),
})
