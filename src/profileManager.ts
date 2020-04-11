import { XchLibp2pConfig } from "./config"
import path from "path"
import fs from "fs"
import Debug from "debug"
const debug = Debug("xch:profile")

export class ProfilePathError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

type ProfileManagerOptions = {
  profileDir: string,
}

export class ProfileManager {
  profileDir: string
  configDir: string
  config: XchLibp2pConfig

  private constructor({ profileDir }: ProfileManagerOptions) {
    this.profileDir = path.resolve(profileDir)
  }

  private async _validate(): Promise<void> {
  }

  private static async _createDirIfNotExist(pathStr: string): Promise<void> {
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
    }
  }

  private async _init(): Promise<void> {
    await ProfileManager._createDirIfNotExist(this.profileDir)

    // Initialize config
    // Read manual config and automatic(ends with .automatic.yaml) config files
    // Complete the config with default generated entries
    // Write default entries into another .automatic.yaml config file, named after current time
    this.configDir = path.join(this.profileDir, "config")
    await ProfileManager._createDirIfNotExist(this.configDir)

    const filesUnderConfigDir = await fs.promises.readdir(this.configDir)
    const configFiles = filesUnderConfigDir.filter((v) => [".yaml", ".yml"].includes(path.extname(v))).map((v) => path.join(this.configDir, v))
    const automaticConfigFiles = configFiles.filter((v) => path.basename(v, path.extname(v)).endsWith(".automatic"))
    const manualConfigFiles = configFiles.filter((v) => !path.basename(v, path.extname(v)).endsWith(".automatic"))
    const reSortedConfigFiles = [...manualConfigFiles, ...automaticConfigFiles];
    const reSortedConfig = await Promise.all(reSortedConfigFiles.map((filePath) => fs.promises.readFile(filePath, {encoding: "utf-8"})))

    let automaticConfig: Partial<XchLibp2pConfig>

    ;({ finalConfig: this.config, createdDefaultConfig: automaticConfig } = await XchLibp2pConfig.createFromStrings(reSortedConfig))


    if (Object.keys(automaticConfig).length) {
      await fs.promises.writeFile(path.join(this.configDir, new Date().toISOString().replace(/[.:]/g, "-") + ".automatic.yaml"), automaticConfig.toString(), {encoding: "utf-8"})
    }


  }

  /**
   * Creates a ProfileManager.
   * @param options options.profileDir: path to current profile directory.
   */
  static async create(options: ProfileManagerOptions): Promise<ProfileManager> {
    const profileManager = new ProfileManager(options)
    await profileManager._validate()
    await profileManager._init()

    return profileManager
  }
}