const path = require('path')
const Url = require('url-parse')
const chalk = require('chalk')
const fetch = require('node-fetch')
const correctLicenseSpdx = require('spdx-correct')
const semver = require('semver')
const semverResolve = require('semver-resolve')
const execa = require('execa')
const fs = require('fs').promises

const initUtils = require('../lib/utils')

const orgUrl = 'https://github.com/OriginalFunko/'
const memberObjToString = member => `${member.login} (${member.html_url})`

const nodeFeatures = [
  { name: '(Node 4.x)  Template Strings: `string ${variable}`', value: 'templateStrings', versions: '>= 4.0.0', checked: true }, // eslint-disable-line no-template-curly-in-string
  { name: '(Node 5.x)  Array Spread/Rest: ...args, [...args]', value: 'arraySpreadRest', versions: '>= 5.0.0', checked: true },
  { name: '(Node 6.x)  Object.assign()', value: 'objectAssign', versions: '>= 6.0.0', checked: true },
  { name: '(Node 7.6)  Async/Await: await fetch()', value: 'asyncAwait', versions: '>= 7.6.0', checked: true },
  { name: '(Node 8.x)  Trailing Commas in Functions: function (x, y, z,)', value: 'trailingCommasFunctions', versions: '>= 8.0.0', checked: true },
  { name: '(Node 8.3)  Object Spread/Rest: { prop: true, ...otherObj }', value: 'objectSpreadRest', versions: '>= 8.3.0', checked: true },
  { name: '(Node 10.x) fs.Promises', value: 'fsPromises', versions: '>= 10.0.0', checked: false },
  { name: '(Node 10.8) BigInt', value: 'bigInt', versions: '>= 10.8.0', checked: false },
  { name: '(Node 12.x) Static Class Fields: class X { prop = true }', value: 'staticClassFields', versions: '>= 12.0.0', checked: false },
]

const osChoices = [
  { name: 'Windows', value: 'win32', checked: true },
  { name: 'macOS', value: 'darwin', checked: true },
  { name: 'Linux', value: 'linux', checked: true },
]

module.exports = {
  async prompting() {
    const packageJson = this.fs.readJSON(this.destinationPath('package.json'), {})

    this.log(`Querying ${chalk.blue('GitHub')} org users...`)
    // Find out who is in the organization, to select users.
    const githubApiRoot = 'https://api.github.com'
    const membersUrl = '/orgs/OriginalFunko/members'
    const githubMembers = await (await fetch(new Url(membersUrl, githubApiRoot))).json()

    let defaultAuthor = null
    const memberChoices = githubMembers.map(member => {
      const memberString = memberObjToString(member)
      if( packageJson.author === memberString ) { defaultAuthor = member }
      return {
        name: memberString,
        value: member,
        checked: 'contributors' in packageJson && packageJson.contributors.includes(memberString),
      }
    })

    this.log(`Initializing ${chalk.blue('package.json')}...`)
    const questions = [{
      // Emulate NPM init, without questions we'll answer ourselves.
      // Name is this.props.name
      // Version
      type: 'input',
      name: 'version',
      message: 'version:',
      default: packageJson.version || '1.0.0',
    }, {
      // Description
      type: 'input',
      name: 'description',
      message: 'description:',
      default: packageJson.description,
    }, {
      // Entry point
      type: 'input',
      name: 'entrypoint',
      message: 'entry point:',
      default: packageJson.main || 'index.js',
    }, {
      // Test command
      type: 'input',
      name: 'testCommand',
      message: 'test command:',
      default: ('scripts' in packageJson && 'test' in packageJson.scripts) ? packageJson.scripts.test : 'echo "Error: no test specified" && exit 1',
    }, {
      // Keywords
      type: 'input',
      name: 'keywords',
      message: 'keywords:',
      default: 'keywords' in packageJson ? packageJson.keywords.join(', ') : '',
      filter: val => val.split(/\s*,\s*/),
    }, {
      type: 'list',
      name: 'author',
      message: 'Who is authoring this package?',
      choices: memberChoices,
      default: defaultAuthor,
    }, {
      type: 'checkbox',
      name: 'contributors',
      message: 'Are there any contributors?',
      choices: memberChoices,
    }, {
      type: 'checkbox',
      name: 'nodeUsedFeatures',
      message: 'What Node features does this project use?',
      choices: nodeFeatures,
    }, {
      type: 'checkbox',
      name: 'nodeOperatingSystems',
      message: 'What operating systems does this project work on?',
      choices: osChoices,
    }]

    const packageLockDetected = this.fs.exists(this.destinationPath('package-lock.json'))
    const yarnLockDetected = this.fs.exists(this.destinationPath('yarn.lock'))
    if( packageLockDetected ) {
      if( yarnLockDetected ) {
        questions.push({
          type: 'confirm',
          name: 'fixBothLocks',
          message: `Both ${chalk.blue('package-lock.json')} and ${chalk.blue('yarn.lock')} have been detected. You should not use both NPM and Yarn. Funko prefers Yarn. Convert to Yarn?`,
          default: true,
        })
      } else {
        questions.push({
          type: 'confirm',
          name: 'convertToYarn',
          message: `${chalk.blue('package-lock.json')} has been detected. Funko prefers Yarn. Convert to Yarn?`,
          default: true,
        })
      }
    }

    return this.prompt(questions)
  },

  async writing() {
    const utils = initUtils(this, 'Node')

    if( this.props.fixBothLocks ) {
      this.fs.delete(this.templatePath('package-lock.json'))
    }

    // Formats taken from https://docs.npmjs.com/files/package.json
    const packageJson = {
      name: this.props.name,
      version: this.props.version,
      description: this.props.description,
      main: this.props.entrypoint,
      scripts: {
        test: this.props.testCommand,
      },
      keywords: this.props.keywords,
    }

    // Handle homepage field
    packageJson.homepage = (new Url(packageJson.name, orgUrl)).toString()

    // Handle bugs field
    packageJson.bugs = {
      url: (new Url(packageJson.name, orgUrl)).toString(),
    }

    // Handle author and contributors
    packageJson.author = memberObjToString(this.props.author)
    if( this.props.contributors.length > 0 ) {
      packageJson.contributors = this.props.contributors.map(x => memberObjToString(x))
    }

    // Handle license field
    packageJson.license = correctLicenseSpdx('MPL-2.0')

    // Handle standard keywords
    const ensureKeyword = word => {
      if( !packageJson.keywords.includes(word) ) { packageJson.keywords.push(word) }
    }

    ensureKeyword('funko')

    packageJson.keywords = packageJson.keywords.sort((a, b) => a.localeCompare(b))

    // Handle the 'main' field
    const tryPaths = [
      packageJson.main,
      'index.js',
      'src/index.js',
      'lib/index.js',
    ]

    // Get the first path that is a real file.
    let finalPath = tryPaths.find(p => this.fs.exists(this.destinationPath(p)))
    if( finalPath ) {
      packageJson.main = finalPath
    } else {
      this.log(`${chalk.yellow('Warning:')} could not find entrypoint script. If this is a new project, this error can be ignored.\nOtherwise, adjust the 'main' field in ${chalk.blue('package.json')}.`)
    }

    // Handle the repository field
    packageJson.repository = {
      type: 'git',
      url: (new Url(packageJson.name + '.git', orgUrl)).toString(),
    }

    // Handle the engines field
    const allSelectedSemvers = nodeFeatures.filter(x => this.props.nodeUsedFeatures.includes(x.value)).map(x => x.versions)
    console.log(allSelectedSemvers.join(' '))
    const finalSemver = semverResolve(allSelectedSemvers)
    packageJson.engines = {
      node: finalSemver,
    }

    // Handle the os field
    if( this.props.nodeOperatingSystems.length !== osChoices.length ) {
      packageJson.os = this.props.nodeOperatingSystems
    }

    // Write out the finished field.
    this.fs.extendJSON(this.destinationPath('package.json'), packageJson)

    // Write out the CODEOWNERS file.
    this.fs.write(this.destinationPath(path.join('.github', 'CODEOWNERS')), `* @${this.props.author.login}\n`)

    // Dotfiles
    utils.dotfile('editorconfig')
    utils.dotfile('eslintignore')
    utils.dotfile('eslintrc.js')

    // Handle travis.yml -- only output versions that will actually work.
    const travisLines = [
      'language: node_js',
      'node_js:',
    ].concat(
      [12, 10, 8, 6, 4]
        .filter(version => version >= semver.major(semver.minVersion(finalSemver)) )
        .map(x => `  - v${x}`)
    )
    this.fs.write(this.destinationPath('.travis.yml'), travisLines.join('\n') + '\n')

    this.log('Repository generation complete.')
    this.log(`${chalk.blue('Next steps')}:`)
    this.log(`1. Create the repository on ${chalk.blue('GitHub')}, under our org.`)
    this.log(`2. Make any changes to this repository that you want to make before publishing.`)
    this.log(`3. In this directory, run the following:`)
    this.log(`${chalk.blue('-')} git init`)
    this.log(`${chalk.blue('-')} git remote add origin git@github.com:OriginalFunko/${this.foldername}.git`)
    this.log(`${chalk.blue('-')} git add -A`)
    this.log(`${chalk.blue('-')} git commit -m 'Initial commit'`)
    this.log(`${chalk.blue('-')} git push -u origin master`)
    this.log(`4. Enable ${chalk.blue('Require review from Code Owners')} as described here: https://help.github.com/en/articles/enabling-required-reviews-for-pull-requests.`)
  },

  async install() {
    if( this.props.convertToYarn ) {
      this.log(`Running ${chalk.blue('yarn import')} to convert from NPM to Yarn.`)
      await execa('yarn', ['import'], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
      await fs.unlink(this.destinationPath('package-lock.json'))
    }

    this.log(`Running ${chalk.blue('yarn audit --fix')} to fix any security vulnerabilities.`)
    try {
      await execa('yarn', ['audit', '--fix'], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
    } catch ( err ) {
      this.log(`Yarn audit ${chalk.red('failed')} with exit code ${err.exitCode}. This probably means there are vulnerabilities that must be resolved manually.`)
      this.log('If the vulnerabilities are in your dev dependencies (e.g. eslint, jest) then this is fine.')
    }
  }
}
