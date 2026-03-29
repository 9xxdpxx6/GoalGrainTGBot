import { User } from "@prisma/client";

import { UserRepository } from "../repositories/user.repository";
import { ProfileInput } from "../types/domain";

export class ProfileService {
  constructor(private readonly userRepository: UserRepository) {}

  async getProfile(userId: number): Promise<User | null> {
    return this.userRepository.findByTelegramId(userId);
  }

  async saveProfile(userId: number, profile: ProfileInput): Promise<User> {
    return this.userRepository.upsertProfile(userId, profile);
  }

  async setAllowJunkFood(userId: number, allowJunkFood: boolean): Promise<User> {
    return this.userRepository.setAllowJunkFood(userId, allowJunkFood);
  }

  async touchLastSeen(userId: number): Promise<void> {
    await this.userRepository.touchLastSeen(userId);
  }
}
