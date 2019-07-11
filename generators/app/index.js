const fsSync = require('fs')
const path = require('path')

const Generator = require('yeoman-generator')
const chalk = require('chalk')
const yosay = require('yosay')

const initUtils = require('./lib/utils')

module.exports = class extends Generator {
  constructor(...args) {
    super(...args)

    const typeObj = {}
    const repoTypesPath = path.join(__dirname, 'repoTypes')
    const types = fsSync.readdirSync(repoTypesPath)
    types.forEach(type => {
      const requirePath = path.join(repoTypesPath, type)
      const typeName = path.parse(type).name
      typeObj[typeName] = require(requirePath)
    })

    this.types = typeObj
  }

  async prompting() {
    // Have Yeoman greet the user.
    this.log(
      yosay(`Welcome to the ${chalk.blue('funko-foss')} generator!`)
    )

    // Steal code from Yeoman, but don't do the weird string replace at the end.
    const determineAppname = () => {
      let appname = this.fs.readJSON(this.destinationPath('bower.json'), {}).name
      if(!appname) {
        appname = this.fs.readJSON(this.destinationPath('package.json'), {}).name
      }
      if(!appname) {
        appname = path.basename(this.destinationRoot())
      }
      return appname
    }

    this.foldername = determineAppname()

    // Prompts in multiple steps.
    this.props = await this.prompt([{
      type: 'input',
      name: 'name',
      message: 'Your project name',
      default: this.foldername,
    }, {
      type: 'list',
      name: 'type',
      message: 'What type of project is this?',
      choices: [
        'Node',
        'PHP',
        'Docker',
        'Generic',
      ],
    }])

    if( 'prompting' in this.types[this.props.type] ) {
      Object.assign(this.props, await this.types[this.props.type].prompting.bind(this)())
    }

    // To access props later use this.props.someAnswer
    return this.props
  }

  async writing() {
    const utils = initUtils(this)

    // Normal files
    utils.file('LICENSE.md')

    // Dotfiles
    utils.dotfile('gitignore')
    utils.dotfile('gitattributes')

    if( 'writing' in this.types[this.props.type] ) {
      await this.types[this.props.type].writing.bind(this)()
    }
  }

  async install() {
    if( 'install' in this.types[this.props.type] ) {
      await this.types[this.props.type].install.bind(this)()
    }

    // this.installDependencies()
  }
}
