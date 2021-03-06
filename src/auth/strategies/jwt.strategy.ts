import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigKey } from 'config/configuration';

import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';

// Service
import { AuthService } from '@auth/auth.service';

// Models
import { Request } from 'express';
import { Headers } from '@shared/models/headers.model';
import { JwtPayload } from '@auth/models/jwt.model';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(ConfigKey.JWT_SECRET),
      passReqToCallback: true,
    } as StrategyOptions);
  }

  /**
   * It validates JWT token.
   *
   * @author Dragomir Urdov
   * @param payload JWT payload data.
   * @returns User data.
   */
  async validate(req: Request, payload: JwtPayload) {
    const jwt =
      req.headers.authorization?.split(' ')[1] ?? req.headers.authorization;
    const lang = req.headers[Headers.ACCEPT_LANGUAGE];

    return await this.authService.validateJwt(jwt, payload, lang);
  }
}
