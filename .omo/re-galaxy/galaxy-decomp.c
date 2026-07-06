// ===== FUN_004d3bd0 @0x4d3bd0 =====

/* WARNING: Removing unreachable block (ram,0x004d4bbe) */
/* WARNING: Removing unreachable block (ram,0x004d4bc5) */
/* WARNING: Removing unreachable block (ram,0x004d4c0d) */
/* WARNING: Removing unreachable block (ram,0x004d4c5e) */
/* WARNING: Removing unreachable block (ram,0x004d4c68) */
/* WARNING: Removing unreachable block (ram,0x004d4c74) */
/* WARNING: Removing unreachable block (ram,0x004d4c7a) */
/* WARNING: Removing unreachable block (ram,0x004d4c87) */
/* WARNING: Removing unreachable block (ram,0x004d4c9d) */
/* WARNING: Removing unreachable block (ram,0x004d4cb1) */
/* WARNING: Removing unreachable block (ram,0x004d4cb3) */
/* WARNING: Removing unreachable block (ram,0x004d4cba) */
/* WARNING: Removing unreachable block (ram,0x004d4cec) */
/* WARNING: Removing unreachable block (ram,0x004d4cf4) */
/* WARNING: Removing unreachable block (ram,0x004d4d00) */
/* WARNING: Removing unreachable block (ram,0x004d4d06) */
/* WARNING: Removing unreachable block (ram,0x004d4ca5) */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

uint __fastcall FUN_004d3bd0(int param_1)

{
  byte bVar1;
  float fVar2;
  undefined4 uVar3;
  uint uVar4;
  undefined4 *puVar5;
  int iVar6;
  undefined4 *puVar7;
  undefined4 *puVar8;
  uint uVar9;
  uint uVar10;
  undefined *puVar11;
  int iVar12;
  int *piVar13;
  int iVar14;
  float fStack_218;
  undefined1 *puStack_214;
  float fStack_210;
  int iStack_20c;
  float fStack_208;
  undefined *puStack_204;
  undefined1 uStack_200;
  undefined1 uStack_1ff;
  undefined1 uStack_1fe;
  undefined1 uStack_1fd;
  float fStack_1fc;
  float fStack_1f8;
  float fStack_1f4;
  undefined4 local_1f0;
  undefined4 local_1ec;
  undefined4 local_1e8;
  undefined4 local_1e4;
  undefined4 local_1e0;
  undefined4 local_1dc;
  undefined4 local_1d8;
  undefined4 local_1d4;
  undefined4 local_1d0;
  undefined4 local_1cc;
  undefined4 local_1c8;
  undefined4 local_1c4;
  float local_1c0;
  undefined4 local_1bc;
  undefined4 local_1b8;
  undefined4 local_1b4;
  undefined4 local_1b0;
  undefined4 local_1ac;
  undefined4 local_1a8;
  undefined4 local_1a4;
  undefined4 local_1a0;
  undefined4 local_19c;
  undefined4 local_198;
  undefined4 local_194;
  undefined4 local_190;
  undefined4 local_18c;
  undefined4 local_188;
  undefined4 local_184;
  float local_180;
  undefined4 local_17c;
  undefined4 local_178;
  undefined4 local_174;
  int local_170;
  undefined4 uStack_16c;
  undefined4 uStack_168;
  undefined4 uStack_164;
  undefined4 auStack_160 [21];
  undefined1 auStack_10c [264];
  
  local_170 = param_1;
  FUN_004d4d20();
  FUN_0056a590();
  FUN_004cb7c0();
  FUN_004cd8c0();
  FUN_004ce450();
  FUN_004cb040();
  FUN_004cb040();
  FUN_004cd380();
  FUN_004cd380();
  FUN_004ce450();
  uVar3 = FUN_004d1f70();
  DAT_009d12b8 = FUN_004d21c0(uVar3,0,0,0x20,0x20,0);
  DAT_009d12bc = FUN_004d21c0(uVar3,0,0x20,0x20,0x20,0);
  _DAT_009d12c0 = FUN_004d21c0(uVar3,0x20,0,0x20,0x20,0);
  _DAT_009d12c4 = FUN_004d21c0(uVar3,0x20,0x20,0x20,0x20,0);
  _DAT_009d12c8 = FUN_004d21c0(uVar3,0,0,0x20,0x20,0);
  _DAT_009d12cc = FUN_004d21c0(uVar3,0,0x20,0x20,0x20,0);
  _DAT_009d12d0 = FUN_004d21c0(uVar3,0x20,0,0x20,0x20,0);
  _DAT_009d12d4 = FUN_004d21c0(uVar3,0x20,0x20,0x20,0x20,0);
  _DAT_009d12d8 = FUN_004d21c0(uVar3,0x20,0x40,0x20,0x20,0);
  _DAT_009d12dc = FUN_004d21c0(uVar3,0x20,0x40,0x20,0x20,0);
  FUN_004cb040();
  uVar3 = FUN_004d1f70();
  uVar3 = FUN_004d21c0(uVar3,0,0,0x640,0x4b0,0);
  *(undefined4 *)(param_1 + 0x54) = uVar3;
  *(undefined4 *)(param_1 + 0x50) = 5;
  uVar4 = FUN_004cf020(&DAT_009d29d8,0x40,0,8);
  if ((char)uVar4 == '\0') {
    return uVar4;
  }
  if (*(int *)(DAT_009d29d8 + 0x24) == 0) {
    iVar14 = 0;
  }
  else {
    iVar14 = *(int *)(DAT_009d29d8 + 8);
  }
  uVar4 = 0;
  if (*(int *)(DAT_009d29d8 + 0x24) != 0) {
    puVar5 = (undefined4 *)(iVar14 + 0x14);
    do {
      puVar5[-2] = 0xffffffff;
      *puVar5 = 0;
      puVar5[-1] = 0;
      puVar5[-5] = 0;
      puVar5[-4] = 0;
      puVar5[-3] = 0;
      uVar4 = uVar4 + 1;
      puVar5 = puVar5 + 6;
    } while (uVar4 < *(uint *)(DAT_009d29d8 + 0x24));
  }
  DAT_009d2f9c = FUN_004d1f70();
  puVar5 = &DAT_009830d0;
  do {
    iVar14 = 100;
    do {
      puVar5[-0xe] = 0;
      puVar5[-1] = 0x3f800000;
      *puVar5 = 0x3f800000;
      puVar5[-8] = 0;
      puVar5[-9] = 0;
      puVar5[-10] = 0;
      puVar7 = puVar5 + -6;
      puVar8 = puVar5 + -0xd;
      iVar12 = 2;
      do {
        *puVar8 = 0;
        *(undefined1 *)(puVar5 + -0xb) = 0xff;
        *(undefined1 *)((int)puVar5 + -0x2b) = 0xff;
        puVar7[1] = 0;
        *puVar7 = 0;
        puVar7[-1] = 0;
        puVar8 = puVar8 + 1;
        puVar7 = puVar7 + 3;
        iVar12 = iVar12 + -1;
      } while (iVar12 != 0);
      puVar5 = puVar5 + 0x10;
      iVar14 = iVar14 + -1;
    } while (iVar14 != 0);
  } while ((int)puVar5 < 0x9d12d0);
  iVar14 = FUN_004d1f30();
  if (iVar14 != 0) {
    FUN_005dd5a0();
    local_188 = 0x3dcccccd;
    local_19c = 0x3dcccccd;
    local_1b0 = 0x3dcccccd;
    thunk_FUN_005a65f3();
    local_1f0 = local_1b0;
    local_1ec = local_1ac;
    local_1e8 = local_1a8;
    local_1e4 = local_1a4;
    local_1e0 = local_1a0;
    local_1dc = local_19c;
    local_1d8 = local_198;
    local_1d4 = local_194;
    local_1d0 = local_190;
    local_1cc = local_18c;
    local_1c8 = local_188;
    local_1c4 = local_184;
    local_1c0 = local_180;
    local_1bc = local_17c;
    local_1b8 = local_178;
    local_1b4 = local_174;
    thunk_FUN_005a5bb1(&local_1f0,&local_1f0);
    local_1b0 = local_1f0;
    local_1ac = local_1ec;
    local_1a8 = local_1e8;
    local_1a4 = local_1e4;
    local_1a0 = local_1e0;
    local_19c = local_1dc;
    local_198 = local_1d8;
    local_194 = local_1d4;
    local_190 = local_1d0;
    local_18c = local_1cc;
    local_188 = local_1c8;
    local_184 = local_1c4;
    local_180 = local_1c0;
    local_17c = local_1bc;
    local_178 = local_1b8;
    local_174 = local_1b4;
    *(undefined4 *)(*(int *)(iVar14 + 4) + 0xdc) = 1;
    FUN_005dd480();
    FUN_005e56c0();
    *(undefined4 *)(iVar14 + 0xb0) = 0;
    *(undefined4 *)(iVar14 + 0xc0) = 1;
  }
  puVar5 = (undefined4 *)&DAT_009d1510;
  for (iVar14 = 0x500; iVar14 != 0; iVar14 = iVar14 + -1) {
    *puVar5 = 0;
    puVar5 = puVar5 + 1;
  }
  fStack_218 = 0.0;
  puStack_204 = (undefined *)0x0;
  do {
    iVar14 = 0;
    piVar13 = &DAT_009d1524 + (int)fStack_218 * 10;
    puVar11 = puStack_204;
    do {
      puStack_214 = (undefined1 *)FUN_004c8b70();
      if ((puStack_214 != (undefined1 *)0x0) && (puStack_214[1] == '\x03')) {
        bVar1 = puStack_214[2];
        if (bVar1 < 7) {
          uVar4 = (uint)bVar1;
        }
        else {
          if (bVar1 != 8) goto LAB_004d4190;
          uVar4 = 7;
        }
        piVar13[2] = uVar4;
        *piVar13 = (int)puStack_204;
        *(undefined1 *)(piVar13 + -5) = 1;
        piVar13[-1] = iVar14;
        fStack_210 = 0.0;
        iStack_20c = 0;
        fStack_208 = 0.0;
        FUN_004d3540(&fStack_210,iVar14);
        piVar13[-4] = (int)fStack_210;
        piVar13[-3] = iStack_20c;
        piVar13[-2] = (int)fStack_208;
        iVar12 = FUN_004c8b70();
        if (*(char *)(iVar12 + 1) == '\x03') {
          iVar12 = FUN_004c8c90();
        }
        else {
          iVar12 = 0;
        }
        piVar13[1] = iVar12;
        puVar5 = (undefined4 *)FUN_004d35e0();
        fVar2 = fStack_218;
        *puVar5 = piVar13 + -5;
        FUN_004b1690(s__d__s__d_____5f____5f____5f___x_00772150,fStack_218,piVar13[1],*puStack_214,
                     (double)(float)piVar13[-4],(double)(float)piVar13[-3],
                     (double)(float)piVar13[-2]);
        fStack_218 = (float)((int)fVar2 + 1);
        piVar13 = piVar13 + 10;
        puVar11 = puStack_204;
      }
LAB_004d4190:
      iVar14 = iVar14 + 1;
    } while (iVar14 < 100);
    puStack_204 = puVar11 + 1;
    if (0x31 < (int)puStack_204) {
      iVar14 = FUN_004d1f30();
      if (iVar14 != 0) {
        FUN_005dd5a0();
        local_1c8 = 0x40000000;
        local_1dc = 0x40000000;
        local_1f0 = 0x40000000;
        *(undefined4 *)(*(int *)(iVar14 + 4) + 0xdc) = 1;
        FUN_005dd480(*(int *)(iVar14 + 4) + 0x18,&local_1f0);
        *(undefined4 *)(iVar14 + 0xc0) = 0xb;
      }
      uVar3 = FUN_004d1f70();
      DAT_009d2ecc = FUN_004d21c0(uVar3,0,0,0x2e7,200,0x400);
      DAT_009d2ed0 = FUN_004d21c0(uVar3,0,200,0x2e7,0xc9,0x400);
      DAT_009d2ed4 = FUN_004d21c0(uVar3,0,400,0x153,199,0x400);
      DAT_009d2ed8 = FUN_004d21c0(uVar3,0x1e2,0x287,0x9f,10,0x400);
      DAT_009d2edc = FUN_004d21c0(uVar3,0x1e2,0x291,0x34,10,0x400);
      DAT_009d2ee0 = FUN_004d21c0(uVar3,0x1e2,0x29b,0x34,10,0x400);
      DAT_009d2ee4 = FUN_004d21c0(uVar3,0x1e2,0x29b,0x34,10,0x400);
      DAT_009d2ee8 = FUN_004d21c0(uVar3,0x1e2,0x2a5,0x28,0xb,0x400);
      _DAT_009d2eec = FUN_004d21c0(uVar3,0x1e2,0x2b0,0x28,0xb,0x400);
      _DAT_009d2ef0 = FUN_004d21c0(uVar3,0x1e2,699,0x28,0xb,0x400);
      _DAT_009d2ef4 = FUN_004d21c0(uVar3,0x1e2,0x2c6,0x28,0xb,0x400);
      DAT_009d2ef8 = FUN_004d21c0(uVar3,0x1e2,0x2d1,0x28,0xb,0x400);
      DAT_009d2efc = FUN_004d21c0(uVar3,0x28,0x27f,10,0x16,0x400);
      DAT_009d2f00 = FUN_004d21c0(uVar3,0x54,0x27f,10,0x16,0x400);
      _DAT_009d2f04 = FUN_004d21c0(uVar3,0,0x311,0x9f,0x17,0x400);
      _DAT_009d2f08 = FUN_004d21c0(uVar3,0xc4,0x29e,0xb,0x49,0x400);
      _DAT_009d2f0c = FUN_004d21c0(uVar3,0xce,0x29e,0xb,0x49,0x400);
      _DAT_009d2f10 = FUN_004d21c0(uVar3,0xd8,0x29e,0xb,0x49,0x400);
      _DAT_009d2f14 = FUN_004d21c0(uVar3,0xe2,0x29e,0xb,0x49,0x400);
      FUN_004cd8c0();
      fStack_1f8 = 0.0;
      iStack_20c = 0;
      fStack_218 = 0.0;
      do {
        fVar2 = fStack_218;
        puStack_214 = (undefined1 *)(float)(int)fStack_218;
        fStack_210 = (float)puStack_214 - _DAT_0066e244;
        fStack_1f4 = -25.0;
        fStack_208 = 25.0;
        fStack_1fc = fStack_210;
        FUN_004cd960(&fStack_1fc,&fStack_210,1,0xff082020,0xff082020,0);
        fStack_218 = (float)((int)fVar2 + 1);
      } while ((int)fStack_218 < 0x65);
      fStack_218 = 0.0;
      do {
        fVar2 = fStack_218;
        puStack_214 = (undefined1 *)(float)(int)fStack_218;
        fStack_208 = (float)puStack_214 - _DAT_0066e61c;
        fStack_1fc = -50.0;
        fStack_210 = 50.0;
        fStack_1f4 = fStack_208;
        FUN_004cd960(&fStack_1fc,&fStack_210,1,0xff082020,0xff082020,0);
        fStack_218 = (float)((int)fVar2 + 1);
      } while ((int)fStack_218 < 0x33);
      fStack_210 = 0.0;
      iStack_20c = 0;
      fStack_208 = 0.0;
      if (DAT_009d15b0 != '\0') {
        FUN_004d3540(&fStack_210,DAT_009d15c0);
      }
      iVar14 = 0;
      puStack_204 = &DAT_01010101;
      uStack_200 = 0;
      uStack_1ff = 0;
      uStack_1fe = 0;
      uStack_1fd = 0;
      fStack_218 = 1.4013e-45;
      iVar12 = 0;
      do {
        FUN_005fe8f3(auStack_10c,s____data_model_planets_p_03d_low__007720d8);
        iVar6 = FUN_004d1f30();
        (&DAT_009d2f74)[iVar14] = iVar6;
        if (iVar6 != 0) {
          if (*(char *)((int)&puStack_204 + iVar14) == '\0') {
            *(undefined4 *)(iVar6 + 0xb0) = 1;
          }
          else {
            FUN_005dd5a0();
            local_1bc = iStack_20c;
            local_1b8 = fStack_208;
            local_1c8 = 0x3bcccccd;
            local_1dc = 0x3bcccccd;
            puStack_214 = (undefined1 *)(((float)(int)fStack_218 + _DAT_0066e074) * _DAT_0066e240);
            local_1f0 = 0x3bcccccd;
            local_1c0 = fStack_210 + (float)puStack_214;
            *(undefined4 *)(*(int *)((&DAT_009d2f74)[iVar14] + 4) + 0xdc) = 1;
            FUN_005dd480();
            fStack_218 = (float)((int)fStack_218 + 1);
            *(undefined4 *)((&DAT_009d2f74)[iVar14] + 0xc0) = 10;
          }
        }
        iVar12 = iVar12 + 10;
        iVar14 = iVar14 + 1;
      } while (iVar12 < 0x50);
      DAT_009d2fac = FUN_004d1f30();
      if (DAT_009d2fac != 0) {
        *(undefined4 *)(DAT_009d2fac + 0xc0) = 0xc;
      }
      FUN_004cb7c0();
      FUN_004cb7c0();
      iVar14 = 0;
      do {
        FUN_005fe8f3(auStack_10c,s____data_model_planets_fs_03d_low_00772090);
        iVar12 = FUN_004d1db0();
        (&DAT_009d2a04)[iVar14] = iVar12;
        if (iVar12 != 0) {
          FUN_005e56c0();
        }
        FUN_005fe8f3(auStack_10c,s____data_model_images_lo_fs_glow__00772064);
        uVar3 = FUN_004d2290(0,auStack_10c,0,0,0,0,0);
        (&DAT_009d2934)[iVar14] = uVar3;
        iVar14 = iVar14 + 1;
      } while (iVar14 < 7);
      _DAT_009d2a20 = FUN_004d1db0();
      if (_DAT_009d2a20 != 0) {
        FUN_005e56c0();
      }
      DAT_009d2a24 = FUN_004d1db0();
      if (DAT_009d2a24 != 0) {
        FUN_005e56c0();
      }
      _DAT_009d2950 = FUN_004d2290(0,s____data_image_strategy_bh_moya_t_00771ff8,0,0,0,0,0);
      DAT_009d2954 = FUN_004d2290(0,s____data_image_strategy_bh_flare__00771fd4,0,0,0,0,0);
      DAT_009d2958 = FUN_004d2290(0,s____data_image_strategy_bh_light__00771fb0,0,0,0,0,0);
      FUN_005dd5a0();
      piVar13 = &DAT_009d152c;
      do {
        if ((char)piVar13[-7] != '\0') {
          fStack_210 = 0.0;
          iStack_20c = 0;
          fStack_208 = 0.0;
          FUN_004d3540(&fStack_210,piVar13[-3]);
          thunk_FUN_005a65f3();
          iVar14 = FUN_004d1e70();
          if (iVar14 != 0) {
            local_1b8 = fStack_208;
            piVar13[1] = iVar14;
            local_1c0 = fStack_210;
            local_1bc = iStack_20c;
            local_1f0 = 0x3b4ccccd;
            if (*piVar13 != 7) {
              local_1f0 = 0x3d800000;
            }
            *(undefined4 *)(*(int *)(iVar14 + 4) + 0xdc) = 1;
            local_1dc = local_1f0;
            local_1c8 = local_1f0;
            FUN_005dd480();
          }
          if ((*piVar13 == 7) && (DAT_009d2a24 != 0)) {
            iVar14 = FUN_004d1e70();
            *(undefined4 *)(iVar14 + 0xc0) = 0xb;
            local_1c0 = fStack_210;
            local_1bc = iStack_20c;
            local_1b8 = fStack_208;
            piVar13[2] = iVar14;
            local_1c8 = 0x3c4ccccd;
            local_1dc = 0x3c4ccccd;
            local_1f0 = 0x3c4ccccd;
            *(undefined4 *)(*(int *)(iVar14 + 4) + 0xdc) = 1;
            FUN_005dd480();
          }
          else {
            *(undefined4 *)(iVar14 + 0xc0) = 0xb;
          }
        }
        piVar13 = piVar13 + 10;
      } while ((int)piVar13 < 0x9d292c);
      FUN_004cb7c0();
      FUN_004cb7c0();
      FUN_004cc440();
      uStack_16c = 0xbe4ccccd;
      uStack_164 = 0xbe4ccccd;
      iStack_20c = 0;
      uStack_168 = 0;
      fStack_1fc = 0.2;
      fStack_1f8 = 0.5;
      fStack_1f4 = 0.2;
      auStack_160[0] = 0xff202080;
      auStack_160[1] = 0xff2020ff;
      auStack_160[2] = 0xff6060ff;
      auStack_160[3] = 0xffff8020;
      auStack_160[4] = 0xffff2020;
      fStack_218 = 0.0;
      do {
        fVar2 = fStack_218;
        puStack_214 = (undefined1 *)(float)(int)fStack_218;
        uVar4 = (int)fStack_218 - 5;
        uVar9 = (int)uVar4 >> 0x1f;
        fStack_208 = _DAT_0066e634 - (float)puStack_214;
        iVar14 = 0;
        fStack_210 = 0.5;
        do {
          fStack_210 = fStack_210 + _DAT_0066e074;
          iVar12 = _rand();
          uVar10 = (int)(iVar14 - 5U) >> 0x1f;
          puStack_214 = (undefined1 *)
                        (iVar12 % 5 +
                        (int)((10 - ((uVar4 ^ uVar9) - uVar9)) - ((iVar14 - 5U ^ uVar10) - uVar10))
                        / 2);
          fStack_218 = (float)(int)puStack_214;
          puStack_204 = (undefined *)(fStack_218 * _DAT_0066e17c * fStack_218 * _DAT_0066e17c);
          fStack_1f8 = (float)puStack_204 * _DAT_0066e210 +
                       (fStack_218 + _DAT_0066e074) * _DAT_0066e220;
          FUN_004cc8a0(&fStack_210,&uStack_16c,&fStack_1fc,0,0,1,auStack_160[(int)puStack_214 / 2],0
                      );
          iVar14 = iVar14 + 1;
        } while (iVar14 < 10);
        fStack_218 = (float)((int)fVar2 + 1);
      } while ((int)fStack_218 < 10);
      DAT_009d2f98 = FUN_004d1f70();
      uVar4 = FUN_004d91b0(&DAT_009d29c0,0x24,0x96,8);
      if ((char)uVar4 == '\0') {
        return uVar4;
      }
      piVar13 = *(int **)(DAT_009d29c0 + 4);
      uVar4 = 0;
      if (piVar13 != (int *)0x0) {
        fStack_218 = 0.0;
        uVar4 = (**(code **)(*piVar13 + 0x2c))(piVar13,0,0,&fStack_218);
        if (-1 < (int)uVar4) {
          uVar4 = 0;
        }
      }
      return uVar4 & 0xffffff00;
    }
  } while( true );
}


// ===== FUN_004133f0 @0x4133f0 =====

void FUN_004133f0(byte *param_1,undefined4 param_2,undefined4 param_3)

{
  byte *pbVar1;
  int iVar2;
  
  FUN_00439da0(param_2,param_3,s__INF_ResponseStaticInformationGr_00760c98);
  FUN_00439da0(param_2,param_3,s_information__d____00760750,*param_1);
  iVar2 = 0;
  if (*param_1 != 0) {
    pbVar1 = param_1 + 2;
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,pbVar1[-1]);
      FUN_00439da0(param_2,param_3,s_type__00760828);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*pbVar1);
      FUN_00439da0(param_2,param_3,s_fixedstar__00760c8c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,pbVar1[1]);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      iVar2 = iVar2 + 1;
      pbVar1 = pbVar1 + 3;
    } while (iVar2 < (int)(uint)*param_1);
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,&DAT_0075ede0);
  return;
}


// ===== FUN_00425c20 @0x425c20 =====

void FUN_00425c20(undefined4 *param_1,undefined4 param_2,undefined4 param_3)

{
  undefined4 *local_10;
  int local_c;
  
  FUN_00439da0(param_2,param_3,s__INF_ResponseInformationObstacle_00761a08);
  FUN_00439da0(param_2,param_3,s_grid__00760e14);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,s_blackhole__d____007619f8,*(undefined1 *)(param_1 + 1));
  local_10 = (undefined4 *)0x0;
  if (*(char *)(param_1 + 1) != '\0') {
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075edfc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[2]);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)(param_1 + 3));
      FUN_00439da0(param_2,param_3,s_model_file__00760b48);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0xe));
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,s_max_suction_speed__007619e4);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)param_1[4]);
      FUN_00439da0(param_2,param_3,s_radius__007619dc);
      FUN_00439da0(param_2,param_3,s___3f__00760930);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      local_10 = (undefined4 *)((int)local_10 + 1);
    } while ((int)local_10 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,s_asteroidbelt__d____007619c8,*(undefined1 *)(param_1 + 6));
  local_10 = (undefined4 *)0x0;
  if (*(char *)(param_1 + 6) != '\0') {
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075edfc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[7]);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)(param_1 + 8));
      FUN_00439da0(param_2,param_3,s_model_file__00760b48);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,s_radius__007619dc);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)param_1[9]);
      FUN_00439da0(param_2,param_3,s_range__007619c0);
      FUN_00439da0(param_2,param_3,s___3f__00760930);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      local_10 = (undefined4 *)((int)local_10 + 1);
    } while ((int)local_10 < (int)(uint)*(byte *)(param_1 + 6));
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,s_gascloud__d____007619b0,*(undefined1 *)(param_1 + 0xb));
  local_c = 0;
  if (*(char *)(param_1 + 0xb) != '\0') {
    local_10 = param_1 + 0xd;
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075edfc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,local_10[-1]);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)local_10);
      FUN_00439da0(param_2,param_3,s_model_file__00760b48);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined2 *)((int)local_10 + 2));
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,s_revolution_radius__00760df8);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)local_10[1]);
      FUN_00439da0(param_2,param_3,s_revolution_cycle__00760de4);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,local_10[2]);
      FUN_00439da0(param_2,param_3,s_revolution_direction__00760dcc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)(local_10 + 3));
      FUN_00439da0(param_2,param_3,s_revolution_init_angle__00760db4);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)local_10[4]);
      FUN_00439da0(param_2,param_3,s_radius__007619dc);
      FUN_00439da0(param_2,param_3,s___3f__00760930);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      local_10 = local_10 + 7;
      local_c = local_c + 1;
    } while (local_c < (int)(uint)*(byte *)(param_1 + 0xb));
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,s_abnormalgravity__d____00761998,*(undefined1 *)(param_1 + 0x52));
  local_c = 0;
  if (*(char *)(param_1 + 0x52) != '\0') {
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075edfc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[0x53]);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)(param_1 + 0x54));
      FUN_00439da0(param_2,param_3,s_model_file__00760b48);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x152));
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,s_gravity_up_range__00761984);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)param_1[0x55]);
      FUN_00439da0(param_2,param_3,s_gravity_down_range__00761970);
      FUN_00439da0(param_2,param_3,s___3f__00760930);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      local_c = local_c + 1;
    } while (local_c < (int)(uint)*(byte *)(param_1 + 0x52));
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,s_circle__d____00761960,*(undefined1 *)(param_1 + 0x57));
  local_c = 0;
  if (*(char *)(param_1 + 0x57) != '\0') {
    local_10 = param_1 + 0x59;
    do {
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_0075edfc);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,local_10[-1]);
      FUN_00439da0(param_2,param_3,s_kind__00760748);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined1 *)local_10);
      FUN_00439da0(param_2,param_3,s_model_file__00760b48);
      FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined2 *)((int)local_10 + 2));
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
      FUN_00439da0(param_2,param_3,&DAT_00761714);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)local_10[1]);
      FUN_00439da0(param_2,param_3,&DAT_00761710);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)local_10[2]);
      FUN_00439da0(param_2,param_3,&DAT_0076170c);
      FUN_00439da0(param_2,param_3,s___3f__00760930,(double)(float)local_10[3]);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      FUN_00439da0(param_2,param_3,s_radius__007619dc);
      FUN_00439da0(param_2,param_3,s___3f__00760930);
      FUN_00439da0(param_2,param_3,&DAT_0075eed0);
      local_10 = local_10 + 6;
      local_c = local_c + 1;
    } while (local_c < (int)(uint)*(byte *)(param_1 + 0x57));
  }
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,&DAT_0075eed0);
  FUN_00439da0(param_2,param_3,&DAT_0075ede0);
  return;
}


// ===== FUN_00497f10 @0x497f10 =====

void FUN_00497f10(undefined4 *param_1,undefined4 param_2,undefined4 *param_3)

{
  undefined4 uVar1;
  int iVar2;
  
  uVar1 = param_3;
  FUN_00439da0(param_2,param_3,s__INF_CommandMoveTroop__0076a5e8);
  FUN_00439da0(param_2,param_3,s_time__007606dc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_wait__00764d4c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[2]);
  FUN_00439da0(param_2,param_3,s_unit__d____007616a0,*(undefined1 *)(param_1 + 3));
  iVar2 = 0;
  if (*(char *)(param_1 + 3) != '\0') {
    param_3 = param_1 + 4;
    do {
      FUN_00439da0(param_2,uVar1,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar2 = iVar2 + 1;
    } while (iVar2 < (int)(uint)*(byte *)(param_1 + 3));
  }
  FUN_00439da0(param_2,uVar1,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar1,s_area__0076a5e0);
  FUN_00439da0(param_2,uVar1,&DAT_0075ef60,*(undefined1 *)(param_1 + 0x24));
  FUN_00439da0(param_2,uVar1,&DAT_0075ede0);
  return;
}


// ===== FUN_004a1820 @0x4a1820 =====

void FUN_004a1820(undefined4 *param_1,undefined4 param_2,undefined4 *param_3)

{
  undefined4 uVar1;
  int iVar2;
  
  uVar1 = param_3;
  FUN_00439da0(param_2,param_3,s__INF_CommandMoveTroop__0076a5e8);
  FUN_00439da0(param_2,param_3,s_time__007606dc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_wait__00764d4c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[2]);
  FUN_00439da0(param_2,param_3,s_unit__d____007616a0,*(undefined1 *)(param_1 + 3));
  iVar2 = 0;
  if (*(char *)(param_1 + 3) != '\0') {
    param_3 = param_1 + 4;
    do {
      FUN_00439da0(param_2,uVar1,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar2 = iVar2 + 1;
    } while (iVar2 < (int)(uint)*(byte *)(param_1 + 3));
  }
  FUN_00439da0(param_2,uVar1,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar1,s_area__0076a5e0);
  FUN_00439da0(param_2,uVar1,&DAT_0075ef60,*(undefined1 *)(param_1 + 0x24));
  FUN_00439da0(param_2,uVar1,&DAT_0075ede0);
  return;
}


// ===== FUN_00457a30 @0x457a30 =====

void FUN_00457a30(undefined1 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined1 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessengerConnection__00767c2c);
  FUN_00439da0(param_2,param_3,s_disconnect__00767c20);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined4 *)(param_1 + 4));
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,param_1[8]);
  iVar5 = 0;
  if (param_1[8] != '\0') {
    param_3 = (undefined2 *)(param_1 + 10);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)param_1[8]);
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0x24));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0x26));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,param_1[0x28]);
  iVar5 = 0;
  if (param_1[0x28] != '\0') {
    param_3 = (undefined2 *)(param_1 + 0x2a);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)(byte)param_1[0x28]);
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,param_1[0x4a]);
  pcVar1 = param_1 + 0x4a;
  param_1 = (undefined1 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x4c));
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x50]);
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x51]);
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,puVar2[0x52]);
      param_2 = 0;
      if (puVar2[0x52] != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x54));
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x58));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x5a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,puVar2[0x5c]);
          iVar5 = 0;
          if (puVar2[0x5c] != '\0') {
            param_3 = (undefined2 *)(puVar2 + 0x5e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)(byte)puVar2[0x5c]);
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)(byte)puVar2[0x52]);
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x4a]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,puVar2[0x78]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x78] != '\0') {
    puVar6 = (undefined4 *)(puVar2 + 0x80);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x78]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x11c));
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x120));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x124));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x128));
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,puVar2[300]);
  iVar5 = 0;
  if (puVar2[300] != '\0') {
    param_3 = (undefined2 *)(puVar2 + 0x12e);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)puVar2[300]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x148));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x14a));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,puVar2[0x14c]);
  iVar5 = 0;
  if (puVar2[0x14c] != '\0') {
    param_3 = (undefined2 *)(puVar2 + 0x14e);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)puVar2[0x14c]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,puVar2[0x16e]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x16e] != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x170));
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x174]);
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x175]);
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,puVar2[0x176]);
      param_2 = 0;
      if (puVar2[0x176] != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x178));
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x17c));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x17e));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,puVar2[0x180]);
          iVar5 = 0;
          if (puVar2[0x180] != '\0') {
            param_3 = (undefined2 *)(puVar2 + 0x182);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)(byte)puVar2[0x180]);
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)(byte)puVar2[0x176]);
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x16e]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,puVar2[0x19c]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x19c] != '\0') {
    puVar6 = (undefined4 *)(puVar2 + 0x1a4);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x19c]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x240));
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x244));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x248));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_sequence__00767ba0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x24c]);
  FUN_00439da0(uVar3,uVar4,s_is_connect_ok__00767c10);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x24d]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00477a90 @0x477a90 =====

void FUN_00477a90(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandReadMail__00767d18);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0045bf50 @0x45bf50 =====

void FUN_0045bf50(undefined4 *param_1,int param_2,undefined4 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandSendMail__00767d00);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              param_3 = (undefined4 *)((int)param_3 + 2);
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              iVar5 = iVar5 + 1;
              param_3 = (undefined4 *)((int)param_3 + 2);
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_subject__d____00767b54,*(undefined1 *)(puVar2 + 0x96));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x96) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x25a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x96));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_body__d____00767b48,*(undefined2 *)((int)puVar2 + 0x35a));
  iVar5 = 0;
  if (*(short *)((int)puVar2 + 0x35a) != 0) {
    param_3 = puVar2 + 0xd7;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(ushort *)((int)puVar2 + 0x35a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00463f30 @0x463f30 =====

void FUN_00463f30(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandReplyOrderSuggestMai_00767d80);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_command__00760790);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x96));
  FUN_00439da0(uVar3,uVar4,s_order_suggest_type__00767d4c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25a));
  FUN_00439da0(uVar3,uVar4,s_type__00760828);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)((int)puVar2 + 0x25b));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0042bff0 @0x42bff0 =====

void FUN_0042bff0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_ResponseInformationDisplayC_00761cdc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef6c);
  FUN_00439da0(param_2,uVar4,s_power__0075ef28);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_camp__0075ef20);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + 0x21));
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_state__0075ef64);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,&DAT_0075ef0c);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + 0x23));
  FUN_00439da0(param_2,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[9]);
  FUN_00439da0(param_2,uVar4,s_birthday_month__0075eefc);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)(param_1 + 10));
  FUN_00439da0(param_2,uVar4,s_birthday_day__0075eeec);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + 0x29));
  FUN_00439da0(param_2,uVar4,s_flagship__007611b4);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0xb]);
  FUN_00439da0(param_2,uVar4,s_flagship_name__d____0075ee78,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_grid__00760e14);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x13]);
  FUN_00439da0(param_2,uVar4,s_base__00761028);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x14]);
  FUN_00439da0(param_2,uVar4,s_spot__007611cc);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x15]);
  FUN_00439da0(param_2,uVar4,s_spot_owner__007611c0);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x16]);
  FUN_00439da0(param_2,uVar4,s_evaluation__00761174);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x17]);
  FUN_00439da0(param_2,uVar4,s_ability_8____0075eed4);
  iVar5 = 0;
  do {
    FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + iVar5 + 0x60));
    iVar5 = iVar5 + 1;
  } while (iVar5 < 8);
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_influence__00761094);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)(param_1 + 0x1a));
  FUN_00439da0(param_2,uVar4,s_stamina__00761088);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined1 *)((int)param_1 + 0x69));
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x6a));
  FUN_00439da0(param_2,uVar4,s_titlename__d____0075ee8c,*(undefined1 *)(param_1 + 0x1b));
  iVar5 = 0;
  if (*(char *)(param_1 + 0x1b) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x6e);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0x1b));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_face__0075ee60);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x22]);
  FUN_00439da0(param_2,uVar4,s_achievement__007607ac);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,param_1[0x23]);
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0x24));
  iVar5 = 0;
  if (*(char *)(param_1 + 0x24) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x92);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0x24));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0xb2));
  pcVar1 = (char *)((int)param_1 + 0xb2);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x2d]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x2e));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0xb9));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0xba));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0xba) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x2f]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x30));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0xc2));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x31));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x31) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0xc6);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x31));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0xba));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0xb2));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x38));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x38) != '\0') {
    puVar6 = puVar2 + 0x3a;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x38));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00467420 @0x467420 =====

void FUN_00467420(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_TransactionInformationMailB_007679c8);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_is_unread__007679bc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)((int)puVar2 + 0x125));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0047f6f0 @0x47f6f0 =====

void FUN_0047f6f0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandReplyOrderSuggestMai_00767d80);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_command__00760790);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x96));
  FUN_00439da0(uVar3,uVar4,s_order_suggest_type__00767d4c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25a));
  FUN_00439da0(uVar3,uVar4,s_type__00760828);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)((int)puVar2 + 0x25b));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00472890 @0x472890 =====

void FUN_00472890(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessenger__00767ce8);
  FUN_00439da0(param_2,param_3,s_time__007606dc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 2));
  iVar5 = 0;
  if (*(char *)(param_1 + 2) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 10);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 2));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 9));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x26));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 10));
  iVar5 = 0;
  if (*(char *)(param_1 + 10) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x2a);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 10));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x4a));
  pcVar1 = (char *)((int)param_1 + 0x4a);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x13]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x14));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x51));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x52));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x52) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x16));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x5a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x17));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x17) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x17));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1e));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1e) != '\0') {
    puVar6 = puVar2 + 0x20;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1e));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_body__d____00767b48,*(undefined2 *)(puVar2 + 0x4a));
  iVar5 = 0;
  if (*(short *)(puVar2 + 0x4a) != 0) {
    param_3 = (undefined2 *)((int)puVar2 + 0x12a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(ushort *)(puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0045ef90 @0x45ef90 =====

void FUN_0045ef90(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandDeleteMail__00767d30);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0046a1b0 @0x46a1b0 =====

void FUN_0046a1b0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandExchangeMailAddress__00767bac);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4a));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4a) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x12a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x51));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x146));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x52));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x52) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x14a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x16a));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x16a) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5b]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5c));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x171));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x172));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x172) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5d]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x5e));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x17a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x5f));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x5f) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x17e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x5f));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x172));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x16a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x66));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x66) != '\0') {
    puVar6 = puVar2 + 0x68;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x66));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x8f]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x90]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x91]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_sequence__00767ba0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x92));
  FUN_00439da0(uVar3,uVar4,s_is_exchange_ok__00767b90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x249));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_004526f0 @0x4526f0 =====

void FUN_004526f0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandExchangeMailAddress__00767bac);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4a));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4a) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x12a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x51));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x146));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x52));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x52) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x14a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x16a));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x16a) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5b]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5c));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x171));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x172));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x172) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5d]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x5e));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x17a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x5f));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x5f) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x17e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x5f));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x172));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x16a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x66));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x66) != '\0') {
    puVar6 = puVar2 + 0x68;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x66));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x8f]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x90]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x91]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_sequence__00767ba0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x92));
  FUN_00439da0(uVar3,uVar4,s_is_exchange_ok__00767b90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x249));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0046d960 @0x46d960 =====

void FUN_0046d960(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessengerStatus__00767bf0);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_status__00767980);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00475a30 @0x475a30 =====

void FUN_00475a30(undefined4 *param_1,int param_2,undefined4 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandSendMail__00767d00);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              param_3 = (undefined4 *)((int)param_3 + 2);
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              iVar5 = iVar5 + 1;
              param_3 = (undefined4 *)((int)param_3 + 2);
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_subject__d____00767b54,*(undefined1 *)(puVar2 + 0x96));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x96) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x25a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x96));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_body__d____00767b48,*(undefined2 *)((int)puVar2 + 0x35a));
  iVar5 = 0;
  if (*(short *)((int)puVar2 + 0x35a) != 0) {
    param_3 = puVar2 + 0xd7;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(ushort *)((int)puVar2 + 0x35a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0045dac0 @0x45dac0 =====

void FUN_0045dac0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandReadMail__00767d18);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00479450 @0x479450 =====

void FUN_00479450(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandDeleteMail__00767d30);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00461440 @0x461440 =====

void FUN_00461440(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandOrderSuggestMail__00767d60);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_command__00760790);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x96));
  FUN_00439da0(uVar3,uVar4,s_order_suggest_type__00767d4c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25a));
  FUN_00439da0(uVar3,uVar4,s_influence__00761094);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25b));
  FUN_00439da0(uVar3,uVar4,&DAT_00761188);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x97]);
  FUN_00439da0(uVar3,uVar4,&DAT_00761180);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x98]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_004555c0 @0x4555c0 =====

void FUN_004555c0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessengerStatus__00767bf0);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_status__00767980);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_004596d0 @0x4596d0 =====

void FUN_004596d0(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessenger__00767ce8);
  FUN_00439da0(param_2,param_3,s_time__007606dc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 2));
  iVar5 = 0;
  if (*(char *)(param_1 + 2) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 10);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 2));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 9));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x26));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 10));
  iVar5 = 0;
  if (*(char *)(param_1 + 10) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x2a);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 10));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x4a));
  pcVar1 = (char *)((int)param_1 + 0x4a);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x13]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x14));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x51));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x52));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x52) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x16));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x5a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x17));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x17) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x17));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1e));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1e) != '\0') {
    puVar6 = puVar2 + 0x20;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1e));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_body__d____00767b48,*(undefined2 *)(puVar2 + 0x4a));
  iVar5 = 0;
  if (*(short *)(puVar2 + 0x4a) != 0) {
    param_3 = (undefined2 *)((int)puVar2 + 0x12a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(ushort *)(puVar2 + 0x4a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00488bb0 @0x488bb0 =====

void FUN_00488bb0(undefined4 *param_1,int param_2,undefined4 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_NotifyInformationMail__00767b70);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined4 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              param_3 = (undefined4 *)((int)param_3 + 2);
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined4 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
              iVar5 = iVar5 + 1;
              param_3 = (undefined4 *)((int)param_3 + 2);
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined4 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
          param_3 = (undefined4 *)((int)param_3 + 2);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_subject__d____00767b54,*(undefined1 *)(puVar2 + 0x96));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x96) != '\0') {
    param_3 = (undefined4 *)((int)puVar2 + 0x25a);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      iVar5 = iVar5 + 1;
      param_3 = (undefined4 *)((int)param_3 + 2);
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x96));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_body__d____00767b48,*(undefined2 *)((int)puVar2 + 0x35a));
  iVar5 = 0;
  if (*(short *)((int)puVar2 + 0x35a) != 0) {
    param_3 = puVar2 + 0xd7;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)param_3);
      param_3 = (undefined4 *)((int)param_3 + 2);
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(ushort *)((int)puVar2 + 0x35a));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0048c040 @0x48c040 =====

void FUN_0048c040(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_NotifyCommandMail__00767da4);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_command__00760790);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x96));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0046c030 @0x46c030 =====

void FUN_0046c030(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandDeleteMailAddress__00767bd0);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00454120 @0x454120 =====

void FUN_00454120(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandDeleteMailAddress__00767bd0);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_0047c270 @0x47c270 =====

void FUN_0047c270(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandOrderSuggestMail__00767d60);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_refer_id__00767b64);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[1]);
  FUN_00439da0(param_2,param_3,s_status__00767980);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,(int)*(char *)(param_1 + 2));
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,param_1[3]);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 4));
  iVar5 = 0;
  if (*(char *)(param_1 + 4) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x12);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 4));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0xb));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x2e));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 0xc));
  iVar5 = 0;
  if (*(char *)(param_1 + 0xc) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x32);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 0xc));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x52));
  pcVar1 = (char *)((int)param_1 + 0x52);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x15]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x16));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x59));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x5a));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x5a) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x17]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x18));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x62));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x19));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x19) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x66);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x19));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x5a));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x52));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x20));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x20) != '\0') {
    puVar6 = puVar2 + 0x22;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x20));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x49]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4a]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4b]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x4c]);
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,*(undefined1 *)(puVar2 + 0x4d));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x4d) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x136);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x4d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x54));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x152));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,*(undefined1 *)(puVar2 + 0x55));
  iVar5 = 0;
  if (*(char *)(puVar2 + 0x55) != '\0') {
    param_3 = (undefined2 *)((int)puVar2 + 0x156);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x55));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)puVar2 + 0x176));
  param_1 = (undefined4 *)0x0;
  if (*(char *)((int)puVar2 + 0x176) != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x5e]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x5f));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x17d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x17e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x17e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x60]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x61));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x186));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x62));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x62) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x18a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x62));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x17e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x176));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x69));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x69) != '\0') {
    puVar6 = puVar2 + 0x6b;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x69));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x92]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x93]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x94]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_time__007606dc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x95]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_command__00760790);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x96));
  FUN_00439da0(uVar3,uVar4,s_order_suggest_type__00767d4c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25a));
  FUN_00439da0(uVar3,uVar4,s_influence__00761094);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x25b));
  FUN_00439da0(uVar3,uVar4,&DAT_00761188);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x97]);
  FUN_00439da0(uVar3,uVar4,&DAT_00761180);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x98]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00450260 @0x450260 =====

void FUN_00450260(undefined4 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined4 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_TransactionInformationMailB_007679c8);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,*(undefined1 *)(param_1 + 1));
  iVar5 = 0;
  if (*(char *)(param_1 + 1) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 6);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 1));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 8));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)((int)param_1 + 0x22));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,*(undefined1 *)(param_1 + 9));
  iVar5 = 0;
  if (*(char *)(param_1 + 9) != '\0') {
    param_3 = (undefined2 *)((int)param_1 + 0x26);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)*(byte *)(param_1 + 9));
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,*(undefined1 *)((int)param_1 + 0x46));
  pcVar1 = (char *)((int)param_1 + 0x46);
  param_1 = (undefined4 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x12]);
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)(puVar2 + 0x13));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined1 *)((int)puVar2 + 0x4d));
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,*(undefined1 *)((int)puVar2 + 0x4e));
      param_2 = 0;
      if (*(char *)((int)puVar2 + 0x4e) != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x14]);
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x15));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar2 + 0x56));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar2 + 0x16));
          iVar5 = 0;
          if (*(char *)(puVar2 + 0x16) != '\0') {
            param_3 = (undefined2 *)((int)puVar2 + 0x5a);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)*(byte *)(puVar2 + 0x16));
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)((int)puVar2 + 0x4e));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)*(byte *)((int)puVar2 + 0x46));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,*(undefined1 *)(puVar2 + 0x1d));
  param_1 = (undefined4 *)0x0;
  if (*(char *)(puVar2 + 0x1d) != '\0') {
    puVar6 = puVar2 + 0x1f;
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined4 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)*(byte *)(puVar2 + 0x1d));
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x46]);
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x47]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x48]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_is_unread__007679bc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)(puVar2 + 0x49));
  FUN_00439da0(uVar3,uVar4,&DAT_007679b4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,(int)*(char *)((int)puVar2 + 0x125));
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


// ===== FUN_00470770 @0x470770 =====

void FUN_00470770(undefined1 *param_1,int param_2,undefined2 *param_3)

{
  char *pcVar1;
  undefined1 *puVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  int iVar5;
  undefined4 *puVar6;
  
  uVar4 = param_3;
  uVar3 = param_2;
  puVar2 = param_1;
  FUN_00439da0(param_2,param_3,s__INF_CommandMessengerConnection__00767c2c);
  FUN_00439da0(param_2,param_3,s_disconnect__00767c20);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*param_1);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075ef6c);
  FUN_00439da0(param_2,param_3,&DAT_0075edfc);
  FUN_00439da0(param_2,param_3,&DAT_0075ef60,*(undefined4 *)(param_1 + 4));
  FUN_00439da0(param_2,param_3,s_display_name__d____0075ee9c,param_1[8]);
  iVar5 = 0;
  if (param_1[8] != '\0') {
    param_3 = (undefined2 *)(param_1 + 10);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)param_1[8]);
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_rank__0075ee68);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0x24));
  FUN_00439da0(param_2,uVar4,s_ladder__00767950);
  FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*(undefined2 *)(param_1 + 0x26));
  FUN_00439da0(param_2,uVar4,s_card__d____00761064,param_1[0x28]);
  iVar5 = 0;
  if (param_1[0x28] != '\0') {
    param_3 = (undefined2 *)(param_1 + 0x2a);
    do {
      FUN_00439da0(param_2,uVar4,&DAT_0075ef60,*param_3);
      param_3 = param_3 + 1;
      iVar5 = iVar5 + 1;
    } while (iVar5 < (int)(uint)(byte)param_1[0x28]);
  }
  FUN_00439da0(param_2,uVar4,&DAT_0075eed0);
  FUN_00439da0(param_2,uVar4,s_outfit__d____00761ccc,param_1[0x4a]);
  pcVar1 = param_1 + 0x4a;
  param_1 = (undefined1 *)0x0;
  if (*pcVar1 != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x4c));
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x50]);
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x51]);
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,puVar2[0x52]);
      param_2 = 0;
      if (puVar2[0x52] != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x54));
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x58));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x5a));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,puVar2[0x5c]);
          iVar5 = 0;
          if (puVar2[0x5c] != '\0') {
            param_3 = (undefined2 *)(puVar2 + 0x5e);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              iVar5 = iVar5 + 1;
              param_3 = param_3 + 1;
            } while (iVar5 < (int)(uint)(byte)puVar2[0x5c]);
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)(byte)puVar2[0x52]);
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x4a]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,puVar2[0x78]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x78] != '\0') {
    puVar6 = (undefined4 *)(puVar2 + 0x80);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x78]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x11c));
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x120));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x124));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
  FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x128));
  FUN_00439da0(uVar3,uVar4,s_display_name__d____0075ee9c,puVar2[300]);
  iVar5 = 0;
  if (puVar2[300] != '\0') {
    param_3 = (undefined2 *)(puVar2 + 0x12e);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)puVar2[300]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_rank__0075ee68);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x148));
  FUN_00439da0(uVar3,uVar4,s_ladder__00767950);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x14a));
  FUN_00439da0(uVar3,uVar4,s_card__d____00761064,puVar2[0x14c]);
  iVar5 = 0;
  if (puVar2[0x14c] != '\0') {
    param_3 = (undefined2 *)(puVar2 + 0x14e);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
      iVar5 = iVar5 + 1;
      param_3 = param_3 + 1;
    } while (iVar5 < (int)(uint)(byte)puVar2[0x14c]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_outfit__d____00761ccc,puVar2[0x16e]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x16e] != '\0') {
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x170));
      FUN_00439da0(uVar3,uVar4,s_index__00760d18);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x174]);
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x175]);
      FUN_00439da0(uVar3,uVar4,s_base__d____00761cc0,puVar2[0x176]);
      param_2 = 0;
      if (puVar2[0x176] != '\0') {
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
          FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x178));
          FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x17c));
          FUN_00439da0(uVar3,uVar4,s_kind__00760748);
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar2 + 0x17e));
          FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,puVar2[0x180]);
          iVar5 = 0;
          if (puVar2[0x180] != '\0') {
            param_3 = (undefined2 *)(puVar2 + 0x182);
            do {
              FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
              param_3 = param_3 + 1;
              iVar5 = iVar5 + 1;
            } while (iVar5 < (int)(uint)(byte)puVar2[0x180]);
          }
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)(byte)puVar2[0x176]);
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x16e]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_charged_base__d____00761ca0,puVar2[0x19c]);
  param_1 = (undefined1 *)0x0;
  if (puVar2[0x19c] != '\0') {
    puVar6 = (undefined4 *)(puVar2 + 0x1a4);
    do {
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,s_card_kind__00761c94);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + -1));
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef6c);
      FUN_00439da0(uVar3,uVar4,&DAT_0075edfc);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*puVar6);
      FUN_00439da0(uVar3,uVar4,s_grid_index__00761cb4);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)(puVar6 + 1));
      FUN_00439da0(uVar3,uVar4,s_kind__00760748);
      FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined2 *)((int)puVar6 + 6));
      FUN_00439da0(uVar3,uVar4,s_name__d____00760b3c,*(undefined1 *)(puVar6 + 2));
      param_2 = 0;
      if (*(char *)(puVar6 + 2) != '\0') {
        param_3 = (undefined2 *)((int)puVar6 + 10);
        do {
          FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*param_3);
          param_3 = param_3 + 1;
          param_2 = param_2 + 1;
        } while (param_2 < (int)(uint)*(byte *)(puVar6 + 2));
      }
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
      param_1 = (undefined1 *)((int)param_1 + 1);
      puVar6 = puVar6 + 10;
    } while ((int)param_1 < (int)(uint)(byte)puVar2[0x19c]);
  }
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_face__0075ee60);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x240));
  FUN_00439da0(uVar3,uVar4,s_begin_session_age__007611f4);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x244));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_card__00761a90);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,*(undefined4 *)(puVar2 + 0x248));
  FUN_00439da0(uVar3,uVar4,&DAT_0075eed0);
  FUN_00439da0(uVar3,uVar4,s_sequence__00767ba0);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x24c]);
  FUN_00439da0(uVar3,uVar4,s_is_connect_ok__00767c10);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ef60,puVar2[0x24d]);
  FUN_00439da0(uVar3,uVar4,&DAT_0075ede0);
  return;
}


