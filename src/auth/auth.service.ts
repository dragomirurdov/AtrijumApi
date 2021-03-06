import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

// Services
import { UserService } from '@user/user.service';
import { SharedService } from '@shared/services/shared.service';
import { MailService } from '@mail/mail.service';

// Decorators
import { UserAgentData } from '@auth/decorators/user-agent.decorator';

// Entities
import { User, UserRelations } from '@user/entities/user.entity';
import { Jwt } from '@auth/entities/jwt.entity';

// Models
import { JwtPayload } from '@auth/models/jwt.model';

// DTO
import { UserCreateDto, UserResDto } from '@user/dto/user.dto';
import { SuccessDto } from '@shared/dto/success.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  /**
   * It validates user data.
   *
   * @author Dragomir Urdov
   * @param email User email address.
   * @param password User password.
   * @param lang Language.
   * @returns User data.
   */
  async validateUser(
    email: string,
    password: string,
    lang?: string,
  ): Promise<User> {
    const user = await User.findOne({
      where: { email },
      relations: [UserRelations.JWT_TOKENS],
    });
    if (!user) {
      throw new NotFoundException({
        message: await this.sharedService.translate(
          'error.User Not Found',
          lang,
        ),
        status: HttpStatus.NOT_FOUND,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      return user;
    } else {
      throw new UnauthorizedException('Bad credentials!');
    }
  }

  /**
   * It validates jwt token and return user if it is valid.
   *
   * @author Dragomir Urdov
   * @param req Request.
   * @param payload Jwt payload.
   * @returns User data.
   */
  async validateJwt(
    jwt: string,
    payload: JwtPayload,
    lang: string,
  ): Promise<User> {
    const user = await this.userService.findOne({
      where: { id: payload.id },
      relations: [UserRelations.JWT_TOKENS],
    });

    if (!user) {
      throw new NotFoundException({
        message: await this.sharedService.translate(
          'error.User Not Found',
          lang,
        ),
        status: HttpStatus.NOT_FOUND,
      });
    }

    const includeToken = user?.jwtTokens.find(
      (token) => token.jwtToken === jwt,
    );

    if (!includeToken) {
      throw new UnauthorizedException();
    }

    return user;
  }

  /**
   * It creates new user and logged in them automatically.
   *
   * @author Dragomir Urdov
   * @param user User data.
   * @param userAgent User device data.
   * @returns Jwt token and user data.
   */
  async signup(
    user: UserCreateDto,
    userAgent: UserAgentData,
  ): Promise<UserResDto> {
    console.log(user);

    const newUser = await this.userService.create(user);

    try {
      const jwtToken = await this.issueJwtToken(newUser, userAgent);
      await this.mailService.sendUserConfirmation(newUser);
      return {
        jwt: {
          token: jwtToken,
          expiresAt: this.jwtExpiresAt(jwtToken),
        },
        user: newUser,
      };
    } catch (error) {
      await this.userService.delete(newUser.id);
      throw new InternalServerErrorException();
    }
  }

  /**
   * It logged in user issuing new jwt token.
   *
   * @author Dragomir Urdov
   * @param user User data.
   * @param userAgent User device data.
   * @returns Jwt token and user data.
   */
  async login(user: User, userAgent: UserAgentData): Promise<UserResDto> {
    const jwtToken = await this.issueJwtToken(user, userAgent);

    return {
      jwt: {
        token: jwtToken,
        expiresAt: this.jwtExpiresAt(jwtToken),
      },
      user,
    };
  }

  /**
   * It logged user out.
   *
   * @author DragomirUrdov
   * @param user User data.
   * @param userAgent User device data.
   * @returns User data
   */
  async logout(
    user: User,
    { os, platform, browser }: UserAgentData,
  ): Promise<SuccessDto> {
    // Delete saved token for specified device.
    const res = await Jwt.delete({
      os,
      platform,
      browser,
      user,
    });

    if (res.affected) {
      return {
        status: HttpStatus.OK,
        message: 'Successfully logged out.',
      };
    }
  }

  /**
   * It refresh already issued jwt token.
   *
   * @author Dragomir Urdov
   * @param user User data.
   * @param userAgent User agent data.
   * @returns New jwt token and user data.
   */
  async refreshToken(
    user: User,
    userAgent: UserAgentData,
  ): Promise<UserResDto> {
    const jwtToken = await this.issueJwtToken(user, userAgent, true);

    return {
      jwt: {
        token: jwtToken,
        expiresAt: this.jwtExpiresAt(jwtToken),
      },
      user,
    };
  }

  /**
   * It issue new jwt token.
   *
   * @author Dragomir Urdov
   * @param payload Jwt payload data.
   * @returns jwt token.
   */
  private async issueJwtToken(
    user: User,
    { os, platform, browser }: UserAgentData,
    preventCreation = false,
  ): Promise<string> {
    const payload = { email: user.email, id: user.id } as JwtPayload;
    const jwtToken = await this.jwtService.signAsync(payload);

    let token = user.jwtTokens?.find(
      (token) =>
        token.os === os &&
        token.platform === platform &&
        token.browser === browser,
    );

    if (token) {
      token.jwtToken = jwtToken;
    } else {
      if (preventCreation) {
        throw new UnauthorizedException('Unauthorized device!');
      }

      // Save token with user and user device data.
      token = new Jwt();
      token.os = os;
      token.platform = platform;
      token.browser = browser;
      token.jwtToken = jwtToken;
      token.user = user;
    }

    try {
      await Jwt.save(token);
    } catch (error) {
      throw new InternalServerErrorException();
    }

    return jwtToken;
  }

  /**
   * It decode jwt token and get expires in date.
   *
   * @author Dragomir Urdov
   * @param jwtToken Jwt token.
   * @returns Jwt expires in date in milliseconds.
   */
  private jwtExpiresAt(jwtToken: string): number {
    const expiresAt =
      (this.jwtService.decode(jwtToken) as JwtPayload).exp * 1000;
    return expiresAt;
  }

  async activateUser(secret: string) {
    const res = await this.userService.update(
      { activationSecret: secret },
      { activationSecret: null },
    );

    if (res.affected) {
      return {
        message: 'User is successfully activated',
      };
    } else {
      return new BadRequestException();
    }
  }

  async resendActivationMail(user: User) {
    // const user = await this.userService.findOne({ where: { id: userId } });
    // const res = await this.userService.update({ id: user.id }, user);
    // return await this.mailService.sendUserConfirmation(newUser);
  }
}
