import { XchLibp2pConfig } from "./config"
import path from "path"
import fs from "fs"
import Debug from "debug-level"
const debug = Debug("xch:profile")

export class ProfilePathError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

type ProfileManagerOptions = {
  profileDir: string,
  clear: string,
}

export class Profile {
  profileDir: string
  configDir: string
  config: XchLibp2pConfig

  private constructor() {}

  /**
   * Creates a Profile.
   * @param options options.profileDir: path to current profile directory.
   */
  static async create(argv: any): Promise<Profile> {
    const {
      profileDir = "./.xch",
      clear = false
    } = argv
    const profile = new Profile()
    profile.profileDir = path.resolve(profileDir)
    await profile.validate()
    await profile.init(argv)

    return profile
  }

  private async validate(): Promise<void> {
  }

  private static async removeDir(pathStr: string): Promise<void> {
    try {
      await fs.promises.rmdir(pathStr, { recursive: true })
      debug.info(`removed dir: ${pathStr}`)
    } catch (err) {
      if (err.code === "ENOENT") {
        debug.info(`dir not exists when removing: ${pathStr}`)
      } else {
        throw err
      }
    }
  }

  private static async removeFiles(pathStrs: string[]): Promise<void> {
    for (const pathStr of pathStrs) {
      try {
        await fs.promises.unlink(pathStr)
        debug.info(`removed file: ${pathStr}`)
      } catch (err) {
        if (err.code === "ENOENT") {
          debug.info(`file not exists when removing: ${pathStr}`)
        } else {
          throw err
        }
      }
    }
  }

  private static async createDirIfNotExist(pathStr: string): Promise<void> {
    let isDirectory = true

    try {
      if (!((await fs.promises.stat(pathStr)).isDirectory())) {
        isDirectory = false
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        isDirectory = false
      } else {
        throw err
      }
    }

    if (!isDirectory) {
      await fs.promises.mkdir(pathStr, { recursive: true })
      debug.info(`made dir because it doesn't exist: ${pathStr}`)
    }
  }

  private async init(argv: any): Promise<void> {
    const {
      clear = ""
    } = argv
    if (clear && (clear === "all" || clear === "profile")) {
      await Profile.removeDir(this.profileDir)
    }

    await Profile.createDirIfNotExist(this.profileDir)

    // Initialize config
    // Read manual config and automatic(ends with .automatic.yaml) config files
    // Complete the config with default generated entries
    // Write default entries into another .automatic.yaml config file, named after current time
    this.configDir = path.join(this.profileDir, "config")

    if (clear && (clear === "all" || clear === "config")) {
      await Profile.removeDir(this.configDir)
    }
    await Profile.createDirIfNotExist(this.configDir)

    const filesUnderConfigDir = await fs.promises.readdir(this.configDir)

    const configFiles = filesUnderConfigDir.filter((v) => [".yaml", ".yml"].includes(path.extname(v))).map((v) => path.join(this.configDir, v))
    let automaticConfigFiles = configFiles.filter((v) => path.basename(v, path.extname(v)).endsWith(".automatic"))
    const manualConfigFiles = configFiles.filter((v) => !path.basename(v, path.extname(v)).endsWith(".automatic"))

    if (clear && (clear === "all" || clear === "autoConfig")) {
      await Profile.removeFiles(automaticConfigFiles)
      automaticConfigFiles = []
    }

    const reSortedConfigFiles = [...manualConfigFiles, ...automaticConfigFiles];
    const reSortedConfig = await Promise.all(reSortedConfigFiles.map((filePath) => fs.promises.readFile(filePath, {encoding: "utf-8"})))

    let automaticConfig: Partial<XchLibp2pConfig>

    ;({ finalConfig: this.config, createdDefaultConfig: automaticConfig } = await XchLibp2pConfig.createFromStrings(reSortedConfig))

    if (Object.keys(automaticConfig).length) {
      await fs.promises.writeFile(path.join(this.configDir, new Date().toISOString().replace(/[.:]/g, "-") + ".automatic.yaml"), automaticConfig.toString(), {encoding: "utf-8"})
    }

    // override some configuration with argv
    await this.config.merge(argv)
  }
}