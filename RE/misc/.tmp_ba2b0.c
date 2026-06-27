// EXACT  0x004ba2b0  FUN_004ba2b0  undefined FUN_004ba2b0()

void __thiscall FUN_004ba2b0(int param_1,uint param_2,undefined4 *param_3)

{
  short *psVar1;
  undefined *puVar2;
  undefined1 uVar3;
  undefined1 uVar4;
  undefined1 uVar5;
  undefined4 uVar6;
  undefined4 uVar7;
  bool bVar8;
  DWORD DVar9;
  undefined2 *puVar10;
  uint uVar11;
  undefined4 uVar12;
  int iVar13;
  int iVar14;
  undefined2 *puVar15;
  int iVar16;
  undefined4 *puVar17;
  undefined4 *puVar18;
  undefined4 *puVar19;
  char *pcVar20;
  ushort *puVar21;
  code *pcVar22;
  undefined1 *puVar23;
  undefined1 local_344 [44];
  undefined4 local_318;
  undefined4 *local_314;
  undefined4 local_310;
  undefined2 local_30c;
  undefined1 local_30a;
  undefined1 local_309;
  undefined4 local_308;
  undefined1 local_304;
  undefined1 local_303;
  undefined4 local_300;
  undefined2 local_2fc;
  undefined4 local_2f8;
  undefined4 local_2f4;
  undefined4 local_2f0;
  undefined4 local_2ec;
  undefined1 local_2e8;
  undefined4 local_2e6 [6];
  undefined4 local_2cc;
  undefined4 local_2c8;
  undefined4 local_2c4;
  undefined4 local_2c0;
  undefined4 local_2bc;
  undefined4 local_2b8;
  undefined2 local_2b4;
  undefined1 local_2b2;
  undefined1 local_2b1;
  undefined1 local_2b0;
  undefined1 local_2af;
  undefined1 local_2ae;
  undefined1 local_2ad;
  undefined1 local_2ac;
  undefined4 local_2a8;
  undefined4 local_2a4;
  undefined4 local_2a0;
  undefined4 local_29c;
  undefined4 local_298;
  undefined1 local_294;
  undefined1 local_293;
  undefined4 local_290 [66];
  undefined4 local_188 [8];
  undefined1 local_168;
  undefined1 local_167;
  undefined1 local_166;
  undefined4 local_164 [40];
  undefined1 local_c4;
  undefined4 local_c0 [32];
  undefined1 local_40;
  uint local_3c;
  uint local_38;
  int iStack_34;
  float local_30;
  undefined2 *local_2c;
  float local_28;
  undefined4 *local_24;
  undefined1 *local_20;
  int local_1c;
  int local_18;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
  local_8 = 0xffffffff;
  puStack_c = &LAB_006624e0;
  local_10 = ExceptionList;
  local_14 = &stack0xfffffcb0;
  local_18 = param_1;
  if (param_3 == (undefined4 *)0x0) {
    ExceptionList = &local_10;
    FUN_005923a0(&DAT_0076f42c,0);
    ExceptionList = local_10;
    return;
  }
  local_1c = 0;
  bVar8 = false;
  ExceptionList = &local_10;
  local_14 = &stack0xfffffcb0;
  FUN_004c29e0();
  if (*(char *)(param_1 + 0x3579cd) != '\0') {
    *(undefined1 *)(param_1 + 0x3579cd) = 0;
    ExceptionList = local_10;
    return;
  }
  local_3c = param_2 & 0xffff;
  if (local_3c < 0x302) {
    if (local_3c == 0x301) {
      FUN_005923a0(s_ResponseTime_OK_0077097c);
      local_1c = -1;
      *(undefined4 *)(param_1 + 0x432418) = *param_3;
      DVar9 = timeGetTime();
      *(DWORD *)(param_1 + 0x357eb0) = DVar9;
      if (*(uint *)(param_1 + 0x357eac) < DVar9) {
        iVar16 = DVar9 - *(uint *)(param_1 + 0x357eac);
      }
      else {
        iVar16 = 0;
      }
      *(int *)(param_1 + 0x357ea8) = iVar16;
      if (*(uint *)(param_1 + 0x357eb8) < *(uint *)(param_1 + 0x432418)) {
        if (*(uint *)(param_1 + 0x357ebc) < DVar9) {
          local_38 = (DVar9 * 0x18 + *(uint *)(param_1 + 0x357ebc) * -0x18) / 1000;
          local_28 = (float)(*(uint *)(param_1 + 0x432418) - *(uint *)(param_1 + 0x357eb8));
          iStack_34 = 0;
          local_30 = (float)local_38;
          *(float *)(param_1 + 0x357eb4) = local_28 / local_30;
        }
      }
      FUN_004c5a30(*(undefined4 *)(param_1 + 0x432418));
      FUN_005923a0(s_Start_time____d_0077096c,*(undefined4 *)(param_1 + 0x432418));
      *(undefined4 *)(param_1 + 0x357eb8) = *(undefined4 *)(param_1 + 0x432418);
      *(DWORD *)(param_1 + 0x357ebc) = DVar9;
      goto LAB_004bdd33;
    }
    switch(local_3c) {
    case 0x201:
      FUN_005923a0(s_SSLoginOK_OK_007709fc);
      *(undefined1 *)(param_1 + 0x35f252) = *(undefined1 *)param_3;
      DAT_007ccffc[0x358375] = 1;
      local_1c = -1;
      DAT_007ccffc[0x35837d] = 1;
      break;
    case 0x202:
      FUN_005923a0(s_SSLoginNG_OK_007709ec);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x35f254);
      for (iVar16 = 0x40; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
      break;
    default:
      goto switchD_004ba340_caseD_203;
    case 0x204:
      FUN_005923a0(s_SSCharacterIDResponce_OK_007709bc);
      *(undefined4 *)(param_1 + 0x3584a0) = *param_3;
      local_1c = -1;
      DAT_007c25f8 = 1;
      break;
    case 0x206:
      FUN_005923a0(s_SSGameLoginOK_OK_007709d8);
      *(undefined1 *)(param_1 + 0x358384) = *(undefined1 *)param_3;
      local_1c = -1;
      DAT_007ccffc[0x35837e] = 1;
      break;
    case 0x207:
      FUN_005923a0(s_GlobalChat_OK_007709ac);
      iVar16 = local_18;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x43d14c);
      for (iVar14 = 0x42; iVar14 != 0; iVar14 = iVar14 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = 0;
      FUN_005923a0(u_>id__d_msg__s_0077098c,*(undefined4 *)(local_18 + 0x43d14c),local_18 + 0x43d152
                  );
      FUN_004be6c0(iVar16 + 0x43d14c);
    }
    goto LAB_004bdd33;
  }
  if (local_3c < 0x33c) {
    if (local_3c == 0x33b) {
      FUN_005923a0(s_ResponseTacticsInformationUnitSh_00770628);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4271a8);
      for (iVar16 = 0x1e79; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004be750((undefined4 *)(local_18 + 0x4271a8));
      goto LAB_004bdd33;
    }
    switch(local_3c) {
    case 0x305:
      FUN_005923a0(s_ResponseStaticInformationCard_OK_007707c8);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3e0c8c);
      for (iVar16 = 0x1482; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
      break;
    default:
      goto switchD_004ba340_caseD_203;
    case 0x307:
      FUN_005923a0(s_ResponseStaticInformationCardCom_007707a0);
      local_2c = (undefined2 *)(param_1 + 0x3e5e98);
      local_28 = (float)((int)param_3 - (param_1 + 0x3e5e96));
      local_1c = -1;
      *(undefined2 *)(param_1 + 0x3e5e96) = *(undefined2 *)param_3;
      local_20 = (undefined1 *)0x12c;
      do {
        *local_2c = *(undefined2 *)((int)local_28 + (int)local_2c);
        *(undefined1 *)(local_2c + 1) = *(undefined1 *)((int)local_28 + 2 + (int)local_2c);
        local_30 = (float)((int)local_2c - ((int)local_28 + (int)local_2c));
        puVar10 = (undefined2 *)((undefined1 *)((int)local_28 + (int)local_2c) + 4);
        local_24 = (undefined4 *)0x18;
        do {
          puVar15 = (undefined2 *)((int)puVar10 + (int)local_30);
          *puVar15 = *puVar10;
          uVar11 = 0;
          do {
            *(undefined1 *)((int)puVar10 + uVar11 + (int)local_30 + 2) =
                 *(undefined1 *)((int)puVar10 + uVar11 + 2);
            uVar11 = uVar11 + 1;
          } while (uVar11 < 3);
          uVar11 = 0;
          do {
            *(undefined1 *)(uVar11 + 5 + (int)puVar15) = *(undefined1 *)((int)puVar10 + uVar11 + 5);
            uVar11 = uVar11 + 1;
          } while (uVar11 < 2);
          puVar23 = (undefined1 *)((int)puVar10 + 7);
          puVar10 = puVar10 + 4;
          local_24 = (undefined4 *)((int)local_24 + -1);
          *(undefined1 *)((int)puVar15 + 7) = *puVar23;
        } while (local_24 != (undefined4 *)0x0);
        local_2c = local_2c + 0x62;
        local_20 = (undefined1 *)((int)local_20 + -1);
      } while (local_20 != (undefined1 *)0x0);
      local_24 = (undefined4 *)0x0;
      local_20 = (undefined1 *)0x0;
      break;
    case 0x309:
      FUN_005923a0(s_ResponseStaticInformationPowerDi_007706e4);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4130a4);
      for (iVar16 = 0x157; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x30b:
      FUN_005923a0(s_ResponseStaticInformationUnitShi_007706bc);
      *(undefined1 *)(param_1 + 0x413600) = *(undefined1 *)param_3;
      local_2c = (undefined2 *)(param_1 + 0x41360a);
      local_28 = (float)((int)param_3 - (param_1 + 0x413600));
      local_1c = -1;
      puVar18 = param_3 + 1;
      local_20 = (undefined1 *)0xc8;
      do {
        *(undefined4 *)(local_2c + -3) = *puVar18;
        local_2c[-1] = *(undefined2 *)(puVar18 + 1);
        *local_2c = *(undefined2 *)((int)local_28 + (int)local_2c);
        *(undefined1 *)(local_2c + 1) = *(undefined1 *)(puVar18 + 2);
        puVar10 = local_2c + 2;
        iVar16 = (int)puVar18 - (int)(local_2c + -3);
        local_24 = (undefined4 *)0xd;
        do {
          *puVar10 = *(undefined2 *)(iVar16 + (int)puVar10);
          puVar10 = puVar10 + 1;
          local_24 = (undefined4 *)((int)local_24 + -1);
        } while (local_24 != (undefined4 *)0x0);
        local_2c[0xf] = *(undefined2 *)(puVar18 + 9);
        *(undefined4 *)(local_2c + 0x11) = puVar18[10];
        local_2c[0x13] = *(undefined2 *)(puVar18 + 0xb);
        local_2c[0x14] = *(undefined2 *)((int)puVar18 + 0x2e);
        local_2c[0x15] = *(undefined2 *)(puVar18 + 0xc);
        local_2c[0x16] = *(undefined2 *)((int)puVar18 + 0x32);
        local_2c[0x17] = *(undefined2 *)(puVar18 + 0xd);
        local_2c[0x18] = *(undefined2 *)((int)puVar18 + 0x36);
        *(undefined4 *)(local_2c + 0x19) = puVar18[0xe];
        *(undefined4 *)(local_2c + 0x1b) = puVar18[0xf];
        puVar10 = local_2c + 0x1d;
        local_24 = (undefined4 *)0xb;
        do {
          *puVar10 = *(undefined2 *)((int)puVar10 + iVar16);
          puVar10 = puVar10 + 1;
          local_24 = (undefined4 *)((int)local_24 + -1);
        } while (local_24 != (undefined4 *)0x0);
        local_2c[0x28] = *(undefined2 *)((int)puVar18 + 0x56);
        local_2c[0x29] = *(undefined2 *)(puVar18 + 0x16);
        *(undefined4 *)(local_2c + 0x2b) = puVar18[0x17];
        *(undefined4 *)(local_2c + 0x2d) = puVar18[0x18];
        local_2c[0x2f] = *(undefined2 *)(puVar18 + 0x19);
        local_2c[0x30] = *(undefined2 *)((int)puVar18 + 0x66);
        local_2c[0x31] = *(undefined2 *)(puVar18 + 0x1a);
        local_2c[0x32] = *(undefined2 *)((int)puVar18 + 0x6a);
        local_2c[0x33] = *(undefined2 *)(puVar18 + 0x1b);
        *(undefined1 *)(local_2c + 0x34) = *(undefined1 *)((int)puVar18 + 0x6e);
        local_2c[0x35] = *(undefined2 *)(puVar18 + 0x1c);
        *(undefined1 *)(local_2c + 0x36) = *(undefined1 *)((int)puVar18 + 0x72);
        *(undefined1 *)((int)local_2c + 0x6d) = *(undefined1 *)((int)puVar18 + 0x73);
        local_2c[0x37] = *(undefined2 *)(puVar18 + 0x1d);
        *(undefined1 *)(local_2c + 0x38) = *(undefined1 *)((int)puVar18 + 0x76);
        *(undefined1 *)((int)local_2c + 0x71) = *(undefined1 *)((int)puVar18 + 0x77);
        local_2c[0x39] = *(undefined2 *)(puVar18 + 0x1e);
        *(undefined1 *)(local_2c + 0x3a) = *(undefined1 *)((int)puVar18 + 0x7a);
        local_2c[0x3b] = *(undefined2 *)(puVar18 + 0x1f);
        *(undefined1 *)(local_2c + 0x3c) = *(undefined1 *)((int)puVar18 + 0x7e);
        local_2c[0x3d] = *(undefined2 *)(puVar18 + 0x20);
        local_2c[0x3e] = *(undefined2 *)((int)puVar18 + 0x82);
        local_2c[0x3f] = *(undefined2 *)(puVar18 + 0x21);
        local_2c[0x40] = *(undefined2 *)((int)puVar18 + 0x86);
        local_2c[0x41] = *(undefined2 *)(puVar18 + 0x22);
        local_2c[0x42] = *(undefined2 *)((int)puVar18 + 0x8a);
        local_2c = local_2c + 0x46;
        puVar18 = puVar18 + 0x23;
        local_20 = local_20 + -1;
      } while (local_20 != (undefined1 *)0x0);
      FUN_004be750(local_18 + 0x413600);
      break;
    case 0x30d:
      FUN_005923a0(s_ResponseStaticInformationUnitTro_00770694);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x412f20);
      for (iVar16 = 0x61; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004be750((undefined4 *)(local_18 + 0x412f20));
      break;
    case 0x30f:
      FUN_005923a0(s_ResponseStaticInformationFighter_00770810);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3f5ab4);
      for (iVar16 = 0xd; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x311:
      FUN_005923a0(s_ResponseStaticInformationArms_OK_00770838);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3f5902);
      for (iVar16 = 0x6c; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x313:
      FUN_005923a0(s_ResponseStaticInformationGridTyp_00770754);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3f57d4);
      for (iVar16 = 0x4b; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      *(undefined1 *)puVar17 = *(undefined1 *)puVar18;
      break;
    case 0x315:
      FUN_005923a0(s_ResponseStaticInformationGrid_OK_0077077c);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3f4448);
      for (iVar16 = 0x4e3; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004abbb0(local_18 + 0x3f444c,param_3);
      break;
    case 0x317:
      FUN_005923a0(s_ResponseInformationGrid_OK_007708e8);
      local_1c = -1;
      *(undefined4 *)(param_1 + 0x35f358) = *param_3;
      break;
    case 0x31d:
      FUN_005923a0(s_ResponseStaticInformationBase_OK_007707ec);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3f5ae8);
      for (iVar16 = 0x1483; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 799:
      FUN_005923a0(s_ResponseInformationBase_OK_00770738);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3facf4);
      for (iVar16 = 0x181; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x321:
      FUN_005923a0(s_ResponseInformationInstitution_O_00770714);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3fb2f8);
      for (iVar16 = 0x2379; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x323:
      FUN_005923a0(s_ResponseInformationCharacter_OK_c_00770944,*(undefined4 *)(local_18 + 0x36a5dc)
                  );
      local_310 = *param_3;
      local_30c = *(undefined2 *)(param_3 + 1);
      local_30a = *(undefined1 *)((int)param_3 + 6);
      local_309 = *(undefined1 *)((int)param_3 + 7);
      local_308 = param_3[2];
      local_303 = *(undefined1 *)((int)param_3 + 0xd);
      local_304 = *(undefined1 *)(param_3 + 3);
      local_300 = param_3[4];
      local_2f8 = param_3[6];
      local_2fc = *(undefined2 *)(param_3 + 5);
      local_2f4 = param_3[7];
      local_2ec = param_3[9];
      local_2f0 = param_3[8];
      local_2e8 = *(undefined1 *)(param_3 + 10);
      uVar12 = param_3[0x11];
      uVar6 = param_3[0x13];
      puVar18 = (undefined4 *)((int)param_3 + 0x2a);
      puVar17 = local_2e6;
      for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      uVar7 = param_3[0x12];
      *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
      local_2cc = uVar12;
      local_2c0 = param_3[0x14];
      local_2c8 = uVar7;
      local_2bc = param_3[0x15];
      local_2c4 = uVar6;
      local_2b8 = param_3[0x16];
      local_2b4 = *(undefined2 *)(param_3 + 0x17);
      local_2b2 = *(undefined1 *)((int)param_3 + 0x5e);
      local_2b1 = *(undefined1 *)((int)param_3 + 0x5f);
      local_2b0 = *(undefined1 *)(param_3 + 0x18);
      local_2af = *(undefined1 *)((int)param_3 + 0x61);
      local_2ae = *(undefined1 *)((int)param_3 + 0x62);
      local_2ad = *(undefined1 *)((int)param_3 + 99);
      local_2ac = *(undefined1 *)(param_3 + 0x19);
      local_2a8 = param_3[0x1a];
      local_2a4 = param_3[0x1b];
      local_2a0 = param_3[0x1c];
      local_29c = param_3[0x1d];
      local_298 = param_3[0x1e];
      local_294 = *(undefined1 *)(param_3 + 0x1f);
      local_293 = *(undefined1 *)((int)param_3 + 0x7d);
      local_1c = -1;
      uVar3 = *(undefined1 *)(param_3 + 0x6a);
      uVar4 = *(undefined1 *)((int)param_3 + 0x1aa);
      puVar18 = param_3 + 0x20;
      puVar17 = local_290;
      for (iVar16 = 0x42; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      puVar18 = param_3 + 0x62;
      puVar17 = local_188;
      for (iVar16 = 8; iVar14 = local_18, iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_167 = *(undefined1 *)((int)param_3 + 0x1a9);
      local_168 = uVar3;
      uVar5 = *(undefined1 *)(param_3 + 0x93);
      local_166 = uVar4;
      puVar18 = param_3 + 0x6b;
      puVar17 = local_164;
      for (iVar16 = 0x28; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_c4 = uVar5;
      puVar18 = param_3 + 0x94;
      puVar17 = local_c0;
      for (iVar16 = 0x20; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_40 = *(undefined1 *)(param_3 + 0xb4);
      *(undefined4 *)(iVar14 + 0x36a5e0) = local_310;
      *(undefined2 *)(iVar14 + 0x36a5e4) = local_30c;
      *(undefined1 *)(iVar14 + 0x36a5e6) = local_30a;
      *(undefined1 *)(iVar14 + 0x36a5e7) = local_309;
      *(undefined4 *)(iVar14 + 0x36a5e8) = local_308;
      *(undefined1 *)(iVar14 + 0x36a5ec) = local_304;
      *(undefined1 *)(iVar14 + 0x36a5ed) = local_303;
      *(undefined4 *)(iVar14 + 0x36a5f0) = local_300;
      *(undefined2 *)(iVar14 + 0x36a5f4) = local_2fc;
      *(undefined4 *)(iVar14 + 0x36a5f8) = local_2f8;
      *(undefined4 *)(iVar14 + 0x36a5fc) = local_2f4;
      *(undefined4 *)(iVar14 + 0x36a600) = local_2f0;
      *(undefined4 *)(iVar14 + 0x36a604) = local_2ec;
      *(undefined1 *)(iVar14 + 0x36a608) = local_2e8;
      puVar18 = local_2e6;
      puVar17 = (undefined4 *)(iVar14 + 0x36a60a);
      for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
      *(undefined4 *)(iVar14 + 0x36a624) = uVar12;
      *(undefined4 *)(iVar14 + 0x36a628) = uVar7;
      *(undefined4 *)(iVar14 + 0x36a62c) = uVar6;
      *(undefined4 *)(iVar14 + 0x36a630) = local_2c0;
      *(undefined4 *)(iVar14 + 0x36a634) = local_2bc;
      *(undefined4 *)(iVar14 + 0x36a638) = local_2b8;
      *(undefined2 *)(iVar14 + 0x36a63c) = local_2b4;
      *(undefined1 *)(iVar14 + 0x36a63e) = local_2b2;
      *(undefined1 *)(iVar14 + 0x36a63f) = local_2b1;
      *(undefined1 *)(iVar14 + 0x36a640) = local_2b0;
      *(undefined1 *)(iVar14 + 0x36a641) = local_2af;
      *(undefined1 *)(iVar14 + 0x36a642) = local_2ae;
      *(undefined1 *)(iVar14 + 0x36a643) = local_2ad;
      *(undefined1 *)(iVar14 + 0x36a644) = local_2ac;
      *(undefined4 *)(iVar14 + 0x36a648) = local_2a8;
      *(undefined4 *)(iVar14 + 0x36a64c) = local_2a4;
      *(undefined4 *)(iVar14 + 0x36a650) = local_2a0;
      *(undefined4 *)(iVar14 + 0x36a654) = local_29c;
      *(undefined4 *)(iVar14 + 0x36a658) = local_298;
      *(undefined1 *)(iVar14 + 0x36a65c) = local_294;
      *(undefined1 *)(iVar14 + 0x36a65d) = local_293;
      puVar18 = local_290;
      puVar17 = (undefined4 *)(iVar14 + 0x36a660);
      for (iVar16 = 0x42; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      puVar18 = local_188;
      puVar17 = (undefined4 *)(iVar14 + 0x36a768);
      for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      *(undefined1 *)(iVar14 + 0x36a788) = uVar3;
      *(undefined1 *)(iVar14 + 0x36a789) = local_167;
      *(undefined1 *)(iVar14 + 0x36a78a) = uVar4;
      puVar18 = local_164;
      puVar17 = (undefined4 *)(iVar14 + 0x36a78c);
      for (iVar16 = 0x28; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      *(undefined1 *)(iVar14 + 0x36a82c) = uVar5;
      puVar18 = local_c0;
      puVar17 = (undefined4 *)(iVar14 + 0x36a830);
      for (iVar16 = 0x20; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      *(undefined1 *)(iVar14 + 0x36a8b0) = local_40;
      puVar18 = (undefined4 *)(iVar14 + 0x36a8b4 + *(int *)(iVar14 + 0x36a5dc) * 0x2d4);
      *puVar18 = local_310;
      *(undefined2 *)(puVar18 + 1) = local_30c;
      *(undefined1 *)((int)puVar18 + 6) = local_30a;
      *(undefined1 *)((int)puVar18 + 7) = local_309;
      puVar18[2] = local_308;
      *(undefined1 *)(puVar18 + 3) = local_304;
      *(undefined1 *)((int)puVar18 + 0xd) = local_303;
      puVar18[4] = local_300;
      *(undefined2 *)(puVar18 + 5) = local_2fc;
      puVar18[6] = local_2f8;
      puVar18[7] = local_2f4;
      puVar18[8] = local_2f0;
      puVar18[9] = local_2ec;
      *(undefined1 *)(puVar18 + 10) = local_2e8;
      puVar17 = local_2e6;
      puVar19 = (undefined4 *)((int)puVar18 + 0x2a);
      for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar19 = *puVar17;
        puVar17 = puVar17 + 1;
        puVar19 = puVar19 + 1;
      }
      *(undefined2 *)puVar19 = *(undefined2 *)puVar17;
      puVar18[0x11] = uVar12;
      puVar18[0x12] = uVar7;
      puVar18[0x13] = uVar6;
      puVar18[0x14] = local_2c0;
      puVar18[0x15] = local_2bc;
      puVar18[0x16] = local_2b8;
      *(undefined2 *)(puVar18 + 0x17) = local_2b4;
      *(undefined1 *)((int)puVar18 + 0x5e) = local_2b2;
      *(undefined1 *)((int)puVar18 + 0x5f) = local_2b1;
      *(undefined1 *)(puVar18 + 0x18) = local_2b0;
      *(undefined1 *)((int)puVar18 + 0x61) = local_2af;
      *(undefined1 *)((int)puVar18 + 0x62) = local_2ae;
      *(undefined1 *)((int)puVar18 + 99) = local_2ad;
      *(undefined1 *)(puVar18 + 0x19) = local_2ac;
      puVar18[0x1a] = local_2a8;
      puVar18[0x1b] = local_2a4;
      puVar18[0x1c] = local_2a0;
      puVar18[0x1d] = local_29c;
      puVar18[0x1e] = local_298;
      *(undefined1 *)(puVar18 + 0x1f) = local_294;
      *(undefined1 *)((int)puVar18 + 0x7d) = local_293;
      puVar17 = local_290;
      puVar19 = puVar18 + 0x20;
      for (iVar16 = 0x42; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar19 = *puVar17;
        puVar17 = puVar17 + 1;
        puVar19 = puVar19 + 1;
      }
      puVar17 = local_188;
      puVar19 = puVar18 + 0x62;
      for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar19 = *puVar17;
        puVar17 = puVar17 + 1;
        puVar19 = puVar19 + 1;
      }
      *(undefined1 *)(puVar18 + 0x6a) = uVar3;
      *(undefined1 *)((int)puVar18 + 0x1a9) = local_167;
      *(undefined1 *)((int)puVar18 + 0x1aa) = uVar4;
      puVar17 = local_164;
      puVar19 = puVar18 + 0x6b;
      for (iVar16 = 0x28; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar19 = *puVar17;
        puVar17 = puVar17 + 1;
        puVar19 = puVar19 + 1;
      }
      *(undefined1 *)(puVar18 + 0x93) = uVar5;
      puVar17 = local_c0;
      puVar19 = puVar18 + 0x94;
      for (iVar16 = 0x20; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar19 = *puVar17;
        puVar17 = puVar17 + 1;
        puVar19 = puVar19 + 1;
      }
      *(undefined1 *)(puVar18 + 0xb4) = local_40;
      iVar16 = *(int *)(local_18 + 0x36a5dc) + 1;
      *(int *)(local_18 + 0x36a5dc) = iVar16;
      if (iVar16 == 1) {
        FUN_004c2c80(1,(undefined4 *)(iVar14 + 0x36a5e0),0);
      }
      break;
    case 0x325:
      FUN_005923a0(s_ResponseInformationUnit_OK_00770678);
      puVar18 = param_3;
      puVar21 = (ushort *)(local_18 + 0x41a364);
      for (iVar16 = 0x3391; iVar16 != 0; iVar16 = iVar16 + -1) {
        *(undefined4 *)puVar21 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar21 = puVar21 + 2;
      }
      local_1c = -1;
      if (600 < *(ushort *)(local_18 + 0x41a364)) {
        FUN_005923a0(&DAT_0077066c,0);
      }
      psVar1 = (short *)(local_18 + 0x41a364);
      FUN_005266e0(psVar1);
      if (*psVar1 == 1) {
        FUN_004c2c80(1,0,local_18 + 0x41a368);
      }
      break;
    case 0x327:
      FUN_005923a0(s_ResponseInformationWarehouse_OK_00770904);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x3e098c);
      for (iVar16 = 0xc0; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004bef50((undefined4 *)(local_18 + 0x3e098c));
      break;
    case 0x329:
      FUN_005923a0(s_ResponseInformationPackage_OK_0077085c);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x36a488);
      for (iVar16 = 0x55; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x32b:
      FUN_005923a0(s_ResponseInformationOutfit_OK_00770924);
      puVar18 = param_3;
      pcVar20 = (char *)(local_18 + 0x3dfe98);
      for (iVar16 = 0x2bd; iVar16 != 0; iVar16 = iVar16 + -1) {
        *(undefined4 *)pcVar20 = *puVar18;
        puVar18 = puVar18 + 1;
        pcVar20 = pcVar20 + 4;
      }
      local_1c = -1;
      if (*(char *)(local_18 + 0x3dfe98) == '\x01') {
        FUN_004c31f0(1,local_18 + 0x3dfe9c);
      }
      break;
    case 0x32d:
      FUN_005923a0(s_ResponseGridInformationOutfit_OK_007708a0);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x367e60);
      for (iVar16 = 0x385; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x32f:
      FUN_005923a0(s_ResponseInformationOutfitParty_O_007708c4);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x35f35c);
      for (iVar16 = 0x22c1; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x331:
      FUN_005923a0(s_ResponseOutfitInformationUnit_OK_0077087c);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x368c74);
      for (iVar16 = 0x605; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x337:
      FUN_005923a0(s_ResponseTacticsCharacter_OK_00770650);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x431ab4);
      for (iVar16 = 0x259; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
    }
    goto LAB_004bdd33;
  }
  if (0x903 < local_3c) {
    if (0xf14 < local_3c) {
      if (local_3c < 0x1002) {
        if (local_3c == 0x1001) {
          FUN_005923a0(s_ResponseInformationAccount_OK_0076f86c);
          local_1c = -1;
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x3584a4);
          for (iVar16 = 0x70; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          goto LAB_004bdd33;
        }
        switch(local_3c) {
        case 0xf15:
          FUN_005923a0(s_NotifyCommandMail_OK_0076f8e4);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4871ec);
          for (iVar16 = 0x97; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004c07e0((undefined4 *)(local_18 + 0x4871ec));
          break;
        case 0xf16:
          FUN_005923a0(s_CommandSetTogether_OK_0076f994);
          local_1c = param_3[1];
          *(undefined4 *)(param_1 + 0x43ced4) = *param_3;
          *(undefined4 *)(param_1 + 0x43ced8) = param_3[1];
          *(undefined4 *)(param_1 + 0x43cedc) = param_3[2];
          FUN_004c5540((undefined4 *)(param_1 + 0x43ced4));
          break;
        case 0xf17:
          FUN_005923a0(s_CommandSetWillMessage_OK_0076f978);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43cee0);
          for (iVar16 = 0x23; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          break;
        case 0xf18:
          FUN_005923a0(s_CommandSetOfflineDirection_OK_0076f958);
          local_1c = param_3[1];
          puVar18 = (undefined4 *)(param_1 + 0x43cf6c);
          goto LAB_004bc2b2;
        case 0xf19:
          FUN_005923a0(s_CommandSetUnitDistributePriority_0076f934);
          local_1c = param_3[1];
          puVar18 = (undefined4 *)(param_1 + 0x43cf7c);
          goto LAB_004bc5bf;
        case 0xf1a:
          FUN_005923a0(s_CommandSetReturnBase_OK_0076f91c);
          local_1c = param_3[1];
          puVar18 = (undefined4 *)(param_1 + 0x43cf8c);
LAB_004bc063:
          *puVar18 = *param_3;
          puVar18[1] = param_3[1];
          puVar18[2] = param_3[2];
          break;
        case 0xf1b:
          FUN_005923a0(s_CommandSetPrivateAccountRate_OK_0076f8fc);
          local_1c = param_3[1];
          puVar18 = (undefined4 *)(param_1 + 0x43cf98);
LAB_004bc093:
          *puVar18 = *param_3;
          puVar18[1] = param_3[1];
          puVar18[2] = param_3[2];
          break;
        case 0xf1c:
          FUN_005923a0(s_CommandGridChat_OK_0076f8bc);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43cfa4);
          for (iVar16 = 0x23; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004be660((undefined4 *)(local_18 + 0x43cfa4));
          break;
        case 0xf1d:
          FUN_005923a0(s_CommandSpotChat_OK_0076f8a8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43d030);
          for (iVar16 = 0x23; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004be680((undefined4 *)(local_18 + 0x43d030));
          break;
        case 0xf1e:
          FUN_005923a0(s_CommandSpotUnicastChat_OK_0076f88c);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43d0bc);
          for (iVar16 = 0x24; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004be6a0((undefined4 *)(local_18 + 0x43d0bc));
          break;
        case 0xf1f:
          FUN_005923a0(s_NotifyTactics_OK_0076f8d0);
          *(undefined4 *)(&DAT_00433b1c + param_1) = *param_3;
          *(undefined4 *)(&DAT_00433b20 + param_1) = param_3[1];
          local_1c = 0;
          FUN_004c1b20(&DAT_00433b1c + param_1);
          break;
        default:
          goto switchD_004ba340_caseD_203;
        }
        goto LAB_004bdd33;
      }
      if (local_3c < 0x1201) {
        if (local_3c == 0x1200) {
          FUN_005923a0(s_TransactionSimpleDataBegin_OK_0076f7a0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x48744c);
          for (iVar16 = 9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c1dd0((undefined4 *)(local_18 + 0x48744c));
          goto LAB_004bdd33;
        }
        switch(local_3c) {
        case 0x1003:
          FUN_005923a0(s_ResponseUnChargeCharacter_OK_0076f84c);
          local_1c = -1;
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x358664);
          for (iVar16 = 0x3e9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          break;
        default:
          goto switchD_004ba340_caseD_203;
        case 0x1005:
          FUN_005923a0(s_ResponseCharacterEntryState_OK_0076f82c);
          local_1c = -1;
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x359608);
          for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          break;
        case 0x1006:
          FUN_005923a0(s_CommandOriginalCharacterCharge_O_0076f808);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43241c);
          for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004be760((undefined4 *)(local_18 + 0x43241c),0);
          break;
        case 0x1007:
          FUN_005923a0(s_CommandExtensionCharacterCharge_O_0076f7e4);
          *(undefined4 *)(param_1 + 0x432434) = *param_3;
          local_1c = 0;
          *(undefined4 *)(param_1 + 0x432438) = param_3[1];
          FUN_004be780((undefined4 *)(param_1 + 0x432434),0);
          break;
        case 0x1008:
          FUN_005923a0(s_CommandGenerateCharacterCharge_O_0076f7c0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43243c);
          for (iVar16 = 0x20; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004be7a0((undefined4 *)(local_18 + 0x43243c),0);
        }
        goto LAB_004bdd33;
      }
      if (local_3c < 0x2001) {
        if (local_3c == 0x2000) {
          FUN_005923a0(s_LobbyLoginRequest_OK_0076f540);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x359628);
          for (iVar16 = 0xb; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          DAT_007ccffc[0x35837b] = 0;
          goto LAB_004bdd33;
        }
        switch(local_3c) {
        case 0x1201:
          FUN_005923a0(s_TransactionSimpleDataEnd_OK_0076f784);
          local_1c = -1;
          *(undefined1 *)(param_1 + 0x487470) = *(undefined1 *)param_3;
          FUN_004c1e50((undefined1 *)(param_1 + 0x487470));
          break;
        case 0x1202:
          FUN_005923a0(s_NotifySimpleInformationCharacter_0076f760);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00487474 + local_18);
          for (iVar16 = 0x3841; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c1e80(&DAT_00487474 + local_18);
          break;
        case 0x1203:
          FUN_005923a0(s_NotifySimpleInformationOutfit_OK_0076f710);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x49c948);
          for (iVar16 = 0x899; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c1fa0((undefined4 *)(local_18 + 0x49c948));
          break;
        case 0x1204:
          FUN_005923a0(s_NotifySimpleInformationBase_OK_0076f6f0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x49ebac);
          for (iVar16 = 0x709; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2040((undefined4 *)(local_18 + 0x49ebac));
          break;
        case 0x1205:
          FUN_005923a0(s_NotifySimpleInformationGrid_OK_0076f558);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4c14a4);
          for (iVar16 = 0xc9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c25b0((undefined4 *)(local_18 + 0x4c14a4));
          break;
        case 0x1206:
          FUN_005923a0(s_NotifySimpleInformationStrategy_O_0076f68c);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4a15e4);
          for (iVar16 = 0x191; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c20d0((undefined4 *)(local_18 + 0x4a15e4));
          break;
        case 0x1207:
          FUN_005923a0(s_NotifySimpleInformationUnit_OK_0076f66c);
          puVar18 = param_3;
          puVar17 = (undefined4 *)((int)&PTR_DAT_004a1c28 + local_18);
          for (iVar16 = 0x4b1; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2250((undefined4 *)((int)&PTR_DAT_004a1c28 + local_18));
          break;
        case 0x1208:
          FUN_005923a0(s_NotifySimpleInformationCard_OK_0076f6d0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4a07d0);
          for (iVar16 = 0x385; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2150((undefined4 *)(local_18 + 0x4a07d0));
          break;
        case 0x1209:
          FUN_005923a0(s_NotifySimpleInformationRank_OK_0076f6b0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_0049c91c + local_18);
          for (iVar16 = 10; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
          local_1c = -1;
          *(undefined1 *)((int)puVar17 + 2) = *(undefined1 *)((int)puVar18 + 2);
          FUN_004c21e0(&DAT_0049c91c + local_18);
          break;
        case 0x120a:
          FUN_005923a0(s_NotifySimpleInformationRankingCh_0076f640);
          puVar18 = param_3;
          puVar17 = (undefined4 *)((int)&PTR_DAT_004a2eec + local_18);
          for (iVar16 = 0x1ce9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c22d0((undefined4 *)((int)&PTR_DAT_004a2eec + local_18));
          break;
        case 0x120b:
          FUN_005923a0(s_NotifySimpleInformationCompleten_0076f60c);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4b14cc);
          for (iVar16 = 0xf3d; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2360((undefined4 *)(local_18 + 0x4b14cc));
          break;
        case 0x120c:
          FUN_005923a0(s_NotifySimpleInformationCardAvail_0076f5d8);
          puVar18 = param_3;
          pcVar22 = FUN_004b51c0 + local_18;
          for (iVar16 = 0x871; iVar16 != 0; iVar16 = iVar16 + -1) {
            *(undefined4 *)pcVar22 = *puVar18;
            puVar18 = puVar18 + 1;
            pcVar22 = pcVar22 + 4;
          }
          local_1c = -1;
          FUN_004c23f0(FUN_004b51c0 + local_18);
          break;
        case 0x120d:
          FUN_005923a0(s_NotifySimpleInformationCardAvail_0076f5a8);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4b7384);
          for (iVar16 = 0xbb9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2480((undefined4 *)(local_18 + 0x4b7384));
          break;
        case 0x120e:
          FUN_005923a0(s_NotifySimpleInformationOrderSugg_0076f578);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4aa290);
          for (iVar16 = 0x1c8f; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c2510((undefined4 *)(local_18 + 0x4aa290));
          break;
        case 0x120f:
          FUN_005923a0(s_NotifySimpleInformationCharacter_0076f734);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x495578);
          for (iVar16 = 0x1ce9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = -1;
          FUN_004c1f10((undefined4 *)(local_18 + 0x495578));
          break;
        default:
          goto switchD_004ba340_caseD_203;
        }
        goto LAB_004bdd33;
      }
      if (local_3c < 0x7002) {
        if (local_3c == 0x7001) {
          FUN_005923a0(s_LGLoginOK_OK_0076f490);
          *(undefined4 *)(param_1 + 0x358388) = *param_3;
          *(undefined4 *)(param_1 + 0x35838c) = param_3[1];
          *(undefined4 *)(param_1 + 0x358390) = param_3[2];
          *(undefined4 *)(param_1 + 0x358394) = param_3[3];
          local_1c = -1;
          DAT_007ccffc[0x35837a] = 1;
          goto LAB_004bdd33;
        }
        switch(local_3c) {
        case 0x2001:
          FUN_005923a0(s_LobbyLoginOK_OK_0076f530);
          *(undefined4 *)(param_1 + 0x359654) = *param_3;
          local_1c = -1;
          DAT_007ccffc[0x35837b] = 1;
          break;
        case 0x2002:
          FUN_005923a0(s_LobbyLoginNG_OK_0076f520);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x359658);
          for (iVar16 = 0x40; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
          local_1c = -1;
          DAT_007ccffc[0x35837b] = 0;
          break;
        default:
          goto switchD_004ba340_caseD_203;
        case 0x2004:
          FUN_005923a0(s_LobbyResponseInformationCharacte_0076f4f4);
          local_1c = -1;
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x35975c);
          for (iVar16 = 0x1b7; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          break;
        case 0x2006:
          FUN_005923a0(s_LobbyResponseInformationSession_O_0076f4d0);
          local_1c = -1;
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x359e3c);
          for (iVar16 = 0x14c1; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          break;
        case 0x200a:
          FUN_005923a0(s_LobbySessionLoginOK_OK_0076f4b8);
          *(undefined4 *)(param_1 + 0x35f144) = *param_3;
          *(undefined4 *)(param_1 + 0x35f148) = param_3[1];
          *(undefined4 *)(param_1 + 0x35f14c) = param_3[2];
          local_1c = -1;
          DAT_007ccffc[0x35837c] = 1;
          break;
        case 0x200b:
          FUN_005923a0(s_LobbySessionLoginNG_OK_0076f4a0);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x35f150);
          for (iVar16 = 0x40; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
          local_1c = -1;
          DAT_007ccffc[0x35837c] = 0;
        }
        goto LAB_004bdd33;
      }
      if (local_3c == 0x7002) {
        FUN_005923a0(s_LGLoginNG_OK_0076f448);
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x358398);
        for (iVar16 = 0x41; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
        local_1c = -1;
        DAT_007ccffc[0x358379] = 1;
        goto LAB_004bdd33;
      }
      goto switchD_004ba340_caseD_203;
    }
    if (local_3c == 0xf14) {
      FUN_005923a0(s_CommandReplyOrderSuggestMail_OK_0076f9ac);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x486f90);
      for (iVar16 = 0x97; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = 0;
      if (*(char *)(local_18 + 0x487449) != '\0') {
        FUN_004c2750((undefined4 *)(local_18 + 0x486f90));
        bVar8 = true;
        goto LAB_004bdd33;
      }
LAB_004bd44a:
      local_1c = 0;
      *(undefined1 *)(local_18 + 0x3579cd) = 1;
      goto LAB_004bdd33;
    }
    if (local_3c < 0xc06) {
      if (local_3c == 0xc05) {
        FUN_005923a0(s_CommandSupplement_OK_0076fbe8);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x43dbe4);
        for (iVar16 = 0x2797; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bffa0((undefined4 *)(local_18 + 0x43dbe4),0);
        goto LAB_004bdd33;
      }
      if (0xb06 < local_3c) {
        switch(local_3c) {
        case 0xb07:
          FUN_005923a0(s_NotifyMovedGrid_OK_0076fc14);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00437714 + local_18);
          for (iVar16 = 0x91; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bee20(&DAT_00437714 + local_18);
          break;
        case 0xb08:
          FUN_005923a0(s_NotifyLeaveOutGrid_OK_0076fc28);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4379d4);
          for (iVar16 = 0x47; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004bece0((undefined4 *)(local_18 + 0x4379d4));
          break;
        case 0xb09:
          FUN_005923a0(s_NotifyEnterGridBegin_OK_0076fc68);
          *(undefined4 *)(param_1 + 0x36a5dc) = 0;
          local_1c = 0;
          *(undefined1 *)(param_1 + 0x4376ec) = *(undefined1 *)param_3;
          break;
        case 0xb0a:
          FUN_005923a0(s_NotifyEnterGridEnd_OK_0076fc50);
          *(undefined1 *)(param_1 + 0x4376ed) = *(undefined1 *)param_3;
          puVar23 = DAT_007ccffc;
          local_1c = 0;
          if (*(char *)(param_1 + 0x126711) == '\x02') {
            if (*(char *)(param_1 + 0x4376ec) == '\0') {
              FUN_004c2a80(1);
            }
            else {
              DAT_007ccffc[0x357e84] = 0;
              *(undefined4 *)(puVar23 + 0x357e88) = 0x3f800000;
              *puVar23 = 1;
              *(undefined4 *)(puVar23 + 4) = 1;
            }
          }
          else if (*(char *)(param_1 + 0x126711) == '\0') {
            FUN_004c2a80(1);
            FUN_004c32a0(1);
          }
          break;
        case 0xb0b:
          FUN_005923a0(s_NotifyMovedBase_OK_0076fc00);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x437978);
          for (iVar16 = 0x11; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bee60((undefined4 *)(local_18 + 0x437978));
          break;
        case 0xb0c:
          FUN_005923a0(s_NotifySuppliedFuel_OK_0076fc80);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4374ac);
          for (iVar16 = 0x90; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004c0860((undefined4 *)(local_18 + 0x4374ac));
          break;
        case 0xb0d:
          FUN_005923a0(s_NotifySearch_OK_0076fc40);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00433b38 + local_18);
          for (iVar16 = 0x2a7; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_1c = 0;
          FUN_004bfd30(&DAT_00433b38 + local_18);
          break;
        default:
          goto switchD_004ba340_caseD_203;
        case 0xc00:
          FUN_005923a0(s_CommandCompletenessRepair_OK_0076fcb8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43d254);
          for (iVar16 = 0xd7; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0((undefined4 *)(local_18 + 0x43d254),0);
          break;
        case 0xc01:
          FUN_005923a0(s_CommandCompletenessSupply_OK_0076fc98);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43d5b0);
          for (iVar16 = 0xc9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c5800((undefined4 *)(local_18 + 0x43d5b0),0);
          break;
        case 0xc02:
          FUN_005923a0(s_CommandReorganization_OK_0076fcd8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43d8d4);
          for (iVar16 = 0xc4; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c0030((undefined4 *)(local_18 + 0x43d8d4),0);
        }
        goto LAB_004bdd33;
      }
      if (local_3c == 0xb06) {
        FUN_005923a0(s_CommandSwitchMode_OK_0076fcf4);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x44849c);
        for (iVar16 = 0x59; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004c01a0((undefined4 *)(local_18 + 0x44849c),0);
        goto LAB_004bdd33;
      }
      if (0xb01 < local_3c) {
        switch(local_3c) {
        case 0xb02:
          FUN_005923a0(s_CommandSupplyFuel_OK_0076fd20);
          local_1c = param_3[2];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x437494);
          for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c02f0((undefined4 *)(local_18 + 0x437494),0);
          break;
        case 0xb03:
          FUN_005923a0(s_CommandSearch_OK_0076fd0c);
          local_1c = param_3[2];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00433b24 + local_18);
          for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0(&DAT_00433b24 + local_18,0);
          break;
        case 0xb04:
          FUN_005923a0(s_CommandUnloadTroop_OK_0076fd4c);
          local_1c = param_3[1];
          puVar18 = param_3;
          pcVar22 = FUN_00448450 + local_18 + 4;
          for (iVar16 = 9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *(undefined4 *)pcVar22 = *puVar18;
            puVar18 = puVar18 + 1;
            pcVar22 = pcVar22 + 4;
          }
          FUN_004c00c0(FUN_00448450 + local_18 + 4,0);
          break;
        case 0xb05:
          FUN_005923a0(s_CommandLoadTroop_OK_0076fd38);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x448478);
          for (iVar16 = 9; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c0130((undefined4 *)(local_18 + 0x448478),0);
          break;
        default:
          goto switchD_004ba340_caseD_203;
        }
        goto LAB_004bdd33;
      }
      if (local_3c == 0xb01) {
        FUN_005923a0(s_CommandMoveGrid_OK_0076fd64);
        local_1c = param_3[2];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x4376f0);
        for (iVar16 = 9; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bea90((undefined4 *)(local_18 + 0x4376f0),0);
        goto LAB_004bdd33;
      }
      if (local_3c < 0x907) {
        if (local_3c == 0x906) {
          FUN_005923a0(s_CommandDeleteOutfit_OK_0076fda8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00434900 + local_18);
          for (iVar16 = 0xae5; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c5700(&DAT_00434900 + local_18,0);
          goto LAB_004bdd33;
        }
        if (local_3c == 0x904) {
          FUN_005923a0(s_NotifyCreateOutfitBegin_OK_0076fdc0);
          local_1c = 0;
          *(undefined4 *)(&DAT_004348f8 + param_1) = *param_3;
          goto LAB_004bdd33;
        }
        if (local_3c == 0x905) {
          FUN_005923a0(s_NotifyCreateOutfitEnd_OK_0076fddc);
          local_1c = 0;
          *(undefined4 *)(&DAT_004348fc + param_1) = *param_3;
          goto LAB_004bdd33;
        }
      }
      else {
        if (local_3c == 0x908) {
          FUN_005923a0(s_NotifyFinishStrategyPlan_OK_0076fd78);
          local_1c = 0;
          puVar18 = (undefined4 *)(param_1 + 0x43ca88);
          goto LAB_004bc2b2;
        }
        if (local_3c == 0xb00) {
          FUN_005923a0(s_CommandMoveBase_OK_0076fd94);
          local_1c = param_3[2];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00437958 + local_18);
          for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c5780(&DAT_00437958 + local_18,0);
          goto LAB_004bdd33;
        }
      }
      goto switchD_004ba340_caseD_203;
    }
    if (0xf0a < local_3c) {
      switch(local_3c) {
      case 0xf0b:
        FUN_005923a0(s_CommandExchangeMailAddress_OK_0076fa94);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x485764);
        for (iVar16 = 0x93; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf0c:
        FUN_005923a0(s_CommandDeleteMailAddress_OK_0076fa78);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_004859b0 + local_18);
        for (iVar16 = 0x49; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf0d:
        FUN_005923a0(s_CommandMessengerStatus_OK_0076fa5c);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_00485ad4 + local_18);
        for (iVar16 = 0x4a; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf0e:
        FUN_005923a0(s_CommandMessengerConnection_OK_0076fa3c);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_00485bfc + local_18);
        for (iVar16 = 0x94; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf0f:
        FUN_005923a0(s_CommandMessenger_OK_0076fa28);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_00485e4c + local_18);
        for (iVar16 = 0x14b; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf10:
        FUN_005923a0(s_CommandSendMail_OK_0076fa14);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x486378);
        for (iVar16 = 0x1d7; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf11:
        FUN_005923a0(s_CommandReadMail_OK_0076fa00);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x486ad4);
        for (iVar16 = 0x4b; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf12:
        FUN_005923a0(s_CommandDeleteMail_OK_0076f9e8);
        local_1c = 0;
        puVar18 = param_3;
        puVar17 = (undefined4 *)((int)&PTR_s__Input_SimpleInformationCharacte_00486c00 + local_18);
        for (iVar16 = 0x4b; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        break;
      case 0xf13:
        FUN_005923a0(s_CommandOrderSuggestMail_OK_0076f9cc);
        puVar18 = param_3;
        puVar17 = (undefined4 *)((int)&PTR_DAT_00486d2c + local_18);
        for (iVar16 = 0x99; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_1c = 0;
        if (*(char *)(local_18 + 0x487449) != '\0') {
          FUN_004c2710((undefined4 *)((int)&PTR_DAT_00486d2c + local_18));
          bVar8 = true;
          break;
        }
        goto LAB_004bd44a;
      default:
        goto switchD_004ba340_caseD_203;
      }
      goto LAB_004bdd33;
    }
    if (local_3c == 0xf0a) {
      FUN_005923a0(s_TransactionInformationMailEnd_OK_0076fab4);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_00457014 + local_18);
      for (iVar16 = 0x1d7; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004c2680(&DAT_00457014 + local_18);
      goto LAB_004bdd33;
    }
    if (local_3c < 0xf04) {
      if (local_3c == 0xf03) {
        FUN_005923a0(s_ResponseGridInitialize_OK_0076fb48);
        local_1c = -1;
        *(undefined1 *)(param_1 + 0x35f357) = *(undefined1 *)param_3;
        goto LAB_004bdd33;
      }
      if (local_3c < 0xc0d) {
        if (local_3c == 0xc0c) {
          FUN_005923a0(s_CommandCarryingOut_OK_0076fba0);
          local_1c = param_3[1];
          puVar18 = param_3;
          pcVar22 = FUN_00447b40 + local_18;
          for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
            *(undefined4 *)pcVar22 = *puVar18;
            puVar18 = puVar18 + 1;
            pcVar22 = pcVar22 + 4;
          }
          goto LAB_004bdd33;
        }
        if (local_3c == 0xc08) {
          FUN_005923a0(s_CommandCarryingInOut_OK_0076fbb8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x447a40);
          for (iVar16 = 0x40; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          goto LAB_004bdd33;
        }
        if (local_3c == 0xc0b) {
          FUN_005923a0(s_CommandAssignment_OK_0076fbd0);
          local_1c = param_3[1];
          puVar18 = param_3;
          pcVar22 = FUN_00447b60 + local_18;
          for (iVar16 = 0x237; iVar16 != 0; iVar16 = iVar16 + -1) {
            *(undefined4 *)pcVar22 = *puVar18;
            puVar18 = puVar18 + 1;
            pcVar22 = pcVar22 + 4;
          }
          FUN_004bfcd0(FUN_00447b60 + local_18,0);
          goto LAB_004bdd33;
        }
      }
      else {
        if (local_3c == 0xe00) {
          FUN_005923a0(s_CommandMoveInstitutionSpot_OK_0076fb64);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4379bc);
          for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004beaa0((undefined4 *)(local_18 + 0x4379bc),0);
          goto LAB_004bdd33;
        }
        if (local_3c == 0xf01) {
          FUN_005923a0(s_ResponseWorldInitialize_OK_0076fb84);
          local_1c = -1;
          *(undefined1 *)(param_1 + 0x35f356) = *(undefined1 *)param_3;
          goto LAB_004bdd33;
        }
      }
switchD_004ba340_caseD_203:
      FUN_005923a0(&DAT_0076f458,0);
    }
    else {
      switch(local_3c) {
      case 0xf05:
        FUN_005923a0(s_ResponseInformationMailAddress_O_0076fb24);
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x448808);
        for (iVar16 = 0x1c85; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_1c = -1;
        FUN_005266e0((undefined4 *)(local_18 + 0x448808));
        break;
      default:
        goto switchD_004ba340_caseD_203;
      case 0xf07:
        FUN_005923a0(s_ResponseInformationMessengerStat_0076fafc);
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_0044fa1c + local_18);
        for (iVar16 = 0x1d33; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_1c = -1;
        FUN_005266e0(&DAT_0044fa1c + local_18);
        break;
      case 0xf08:
        FUN_005923a0(s_TransactionInformationMailBegin_O_0076fad8);
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_00456ee8 + local_18);
        for (iVar16 = 0x4a; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_1c = -1;
        FUN_004c2620(&DAT_00456ee8 + local_18);
        break;
      case 0xf09:
        FUN_005923a0(s_TransactionInformationMailEnd_OK_0076fab4);
        (&DAT_00457010)[param_1] = *(undefined1 *)param_3;
        local_1c = -1;
        FUN_004c2660(&DAT_00457010 + param_1);
      }
    }
    goto LAB_004bdd33;
  }
  if (local_3c == 0x903) {
    FUN_005923a0(s_CommandCreateOutfit_OK_0076fdf8);
    local_1c = param_3[1];
    puVar18 = param_3;
    puVar17 = (undefined4 *)(local_18 + 0x4345d4);
    for (iVar16 = 0xc9; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    FUN_004c5650((undefined4 *)(local_18 + 0x4345d4),0);
    goto LAB_004bdd33;
  }
  if (local_3c < 0x424) {
    if (local_3c == 0x423) {
      FUN_005923a0(s_NotifyMovedShip_OK_0077021c);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x433118);
      for (iVar16 = 7; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = 0;
      FUN_004bf870((undefined4 *)(local_18 + 0x433118));
      goto LAB_004bdd33;
    }
    switch(local_3c) {
    case 0x33f:
      FUN_005923a0(s_ResponseTacticsInformationCorps_O_007705ac);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_004044b8 + local_18);
      for (iVar16 = 0x2329; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    default:
      goto switchD_004ba340_caseD_203;
    case 0x341:
      FUN_005923a0(s_ResponseTacticsInformationFillSh_00770584);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_0040d15c + local_18);
      for (iVar16 = 0x1771; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x345:
      FUN_005923a0(s_ResponseTacticsInformationBase_O_007705e8);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4040dc);
      for (iVar16 = 0x81; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x347:
      FUN_005923a0(s_InformationObstacle_OK_007705d0);
      local_1c = -1;
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4042e0);
      for (iVar16 = 0x76; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x349:
      FUN_005923a0(s_ResponsePositionUnit_OK_0077056c);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x42eb8c);
      for (iVar16 = 0xbb9; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004be750((undefined4 *)(local_18 + 0x42eb8c));
      break;
    case 0x34b:
      FUN_005923a0(s_ResponsePositionBase_OK_00770554);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x431a70);
      for (iVar16 = 0x11; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = -1;
      FUN_004be750((undefined4 *)(local_18 + 0x431a70));
      break;
    case 0x34f:
      FUN_005923a0(s_ResponseCardCharacter_OK_0077060c);
      *(undefined2 *)(param_1 + 0x3d4994) = *(undefined2 *)param_3;
      *(undefined1 *)(param_1 + 0x3d4996) = *(undefined1 *)((int)param_3 + 2);
      local_20 = (undefined1 *)((int)param_3 + 0xb);
      iStack_34 = (int)param_3 - (param_1 + 0x3d4994);
      local_1c = -1;
      puVar10 = (undefined2 *)(param_1 + 0x3d499c);
      local_28 = 8.96831e-44;
      do {
        *(undefined4 *)(puVar10 + -2) = *(undefined4 *)(local_20 + -7);
        *puVar10 = *(undefined2 *)(iStack_34 + (int)puVar10);
        *(undefined1 *)(puVar10 + 1) = local_20[-1];
        *(undefined1 *)((int)puVar10 + 3) = *local_20;
        *(undefined4 *)(puVar10 + 2) = *(undefined4 *)(local_20 + 1);
        *(undefined1 *)(puVar10 + 4) = local_20[5];
        *(undefined1 *)((int)puVar10 + 9) = local_20[6];
        *(undefined4 *)(puVar10 + 6) = *(undefined4 *)(local_20 + 9);
        puVar10[8] = *(undefined2 *)(local_20 + 0xd);
        *(undefined4 *)(puVar10 + 10) = *(undefined4 *)(local_20 + 0x11);
        *(undefined4 *)(puVar10 + 0xc) = *(undefined4 *)(local_20 + 0x15);
        *(undefined4 *)(puVar10 + 0xe) = *(undefined4 *)(local_20 + 0x19);
        *(undefined4 *)(puVar10 + 0x10) = *(undefined4 *)(local_20 + 0x1d);
        local_2c = (undefined2 *)(local_20 + (-7 - (int)(puVar10 + -2)));
        *(undefined1 *)(puVar10 + 0x12) = local_20[0x21];
        puVar15 = puVar10 + 0x13;
        local_24 = (undefined4 *)0xd;
        do {
          *puVar15 = *(undefined2 *)((int)local_2c + (int)puVar15);
          puVar15 = puVar15 + 1;
          local_24 = (undefined4 *)((int)local_24 + -1);
        } while (local_24 != (undefined4 *)0x0);
        *(undefined4 *)(puVar10 + 0x20) = *(undefined4 *)(local_20 + 0x3d);
        *(undefined4 *)(puVar10 + 0x22) = *(undefined4 *)(local_20 + 0x41);
        *(undefined4 *)(puVar10 + 0x24) = *(undefined4 *)(local_20 + 0x45);
        *(undefined4 *)(puVar10 + 0x26) = *(undefined4 *)(local_20 + 0x49);
        *(undefined4 *)(puVar10 + 0x28) = *(undefined4 *)(local_20 + 0x4d);
        *(undefined4 *)(puVar10 + 0x2a) = *(undefined4 *)(local_20 + 0x51);
        puVar10[0x2c] = *(undefined2 *)(local_20 + 0x55);
        *(undefined1 *)(puVar10 + 0x2d) = local_20[0x57];
        *(undefined1 *)((int)puVar10 + 0x5b) = local_20[0x58];
        *(undefined1 *)(puVar10 + 0x2e) = local_20[0x59];
        *(undefined1 *)((int)puVar10 + 0x5d) = local_20[0x5a];
        *(undefined1 *)(puVar10 + 0x2f) = local_20[0x5b];
        *(undefined1 *)((int)puVar10 + 0x5f) = local_20[0x5c];
        *(undefined1 *)(puVar10 + 0x30) = local_20[0x5d];
        *(undefined4 *)(puVar10 + 0x32) = *(undefined4 *)(local_20 + 0x61);
        local_24 = (undefined4 *)0x0;
        do {
          *(undefined1 *)((int)local_24 + 0x6cU + (int)(puVar10 + -2)) =
               local_20[(int)local_24 + 0x65];
          local_24 = (undefined4 *)((int)local_24 + 1);
        } while (local_24 < 0x10);
        *(undefined1 *)(puVar10 + 0x3c) = local_20[0x75];
        *(undefined1 *)((int)puVar10 + 0x79) = local_20[0x76];
        local_24 = (undefined4 *)(puVar10 + 0x3e);
        local_30 = 2.8026e-45;
        do {
          puVar18 = (undefined4 *)((int)local_24 + (int)local_2c);
          puVar17 = local_24;
          for (iVar16 = 0x21; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          local_24 = local_24 + 0x21;
          local_30 = (float)((int)local_30 + -1);
        } while (local_30 != 0.0);
        puVar18 = (undefined4 *)(puVar10 + 0xc2);
        iVar16 = 8;
        do {
          *puVar18 = *(undefined4 *)((int)puVar18 + (int)local_2c);
          puVar18 = puVar18 + 1;
          iVar16 = iVar16 + -1;
        } while (iVar16 != 0);
        *(undefined1 *)(puVar10 + 0xd2) = local_20[0x1a1];
        *(undefined1 *)((int)puVar10 + 0x1a5) = local_20[0x1a2];
        *(undefined1 *)(puVar10 + 0xd3) = local_20[0x1a3];
        puVar15 = puVar10 + 0xd4;
        iVar16 = 0x50;
        do {
          *puVar15 = *(undefined2 *)((int)puVar15 + (int)local_2c);
          puVar15 = puVar15 + 1;
          iVar16 = iVar16 + -1;
        } while (iVar16 != 0);
        *(undefined1 *)(puVar10 + 0x124) = local_20[0x245];
        puVar18 = (undefined4 *)(puVar10 + 0x126);
        local_30 = 2.24208e-44;
        do {
          *puVar18 = *(undefined4 *)((int)puVar18 + (int)local_2c);
          puVar18[1] = *(undefined4 *)((int)(puVar18 + 1) + (int)local_2c);
          puVar18 = puVar18 + 2;
          local_30 = (float)((int)local_30 + -1);
        } while (local_30 != 0.0);
        *(undefined1 *)(puVar10 + 0x166) = local_20[0x2c9];
        local_20 = local_20 + 0x2d4;
        puVar10 = puVar10 + 0x16a;
        local_28 = (float)((int)local_28 + -1);
      } while (local_28 != 0.0);
      local_30 = 0.0;
      local_28 = 0.0;
      break;
    case 0x356:
      FUN_005923a0(s_NotifyInformationCharacter_OK_00770248);
      *(undefined1 *)(param_1 + 0x4324bc) = *(undefined1 *)param_3;
      iStack_34 = param_1 + 0x4324bc;
      *(undefined4 *)(param_1 + 0x4324c0) = param_3[1];
      *(undefined2 *)(param_1 + 0x4324c4) = *(undefined2 *)(param_3 + 2);
      *(undefined1 *)(param_1 + 0x4324c6) = *(undefined1 *)((int)param_3 + 10);
      *(undefined1 *)(param_1 + 0x4324c7) = *(undefined1 *)((int)param_3 + 0xb);
      *(undefined4 *)(param_1 + 0x4324c8) = param_3[3];
      *(undefined1 *)(param_1 + 0x4324cc) = *(undefined1 *)(param_3 + 4);
      *(undefined1 *)(param_1 + 0x4324cd) = *(undefined1 *)((int)param_3 + 0x11);
      *(undefined4 *)(param_1 + 0x4324d0) = param_3[5];
      *(undefined2 *)(param_1 + 0x4324d4) = *(undefined2 *)(param_3 + 6);
      *(undefined4 *)(param_1 + 0x4324d8) = param_3[7];
      *(undefined4 *)(param_1 + 0x4324dc) = param_3[8];
      *(undefined4 *)(param_1 + 0x4324e0) = param_3[9];
      *(undefined4 *)(param_1 + 0x4324e4) = param_3[10];
      local_2c = (undefined2 *)((int)param_3 + (4 - (param_1 + 0x4324c0)));
      *(undefined1 *)(param_1 + 0x4324e8) = *(undefined1 *)(param_3 + 0xb);
      local_1c = 0;
      puVar10 = (undefined2 *)(param_1 + 0x4324ea);
      local_28 = 1.82169e-44;
      do {
        *puVar10 = *(undefined2 *)((int)local_2c + (int)puVar10);
        puVar10 = puVar10 + 1;
        local_28 = (float)((int)local_28 + -1);
      } while (local_28 != 0.0);
      *(undefined4 *)(param_1 + 0x432504) = param_3[0x12];
      *(undefined4 *)(param_1 + 0x432508) = param_3[0x13];
      *(undefined4 *)(param_1 + 0x43250c) = param_3[0x14];
      *(undefined4 *)(param_1 + 0x432510) = param_3[0x15];
      *(undefined4 *)(param_1 + 0x432514) = param_3[0x16];
      *(undefined4 *)(param_1 + 0x432518) = param_3[0x17];
      *(undefined2 *)(param_1 + 0x43251c) = *(undefined2 *)(param_3 + 0x18);
      *(undefined1 *)(param_1 + 0x43251e) = *(undefined1 *)((int)param_3 + 0x62);
      *(undefined1 *)(param_1 + 0x43251f) = *(undefined1 *)((int)param_3 + 99);
      *(undefined1 *)(param_1 + 0x432520) = *(undefined1 *)(param_3 + 0x19);
      *(undefined1 *)(param_1 + 0x432521) = *(undefined1 *)((int)param_3 + 0x65);
      *(undefined1 *)(param_1 + 0x432522) = *(undefined1 *)((int)param_3 + 0x66);
      *(undefined1 *)(param_1 + 0x432523) = *(undefined1 *)((int)param_3 + 0x67);
      *(undefined1 *)(param_1 + 0x432524) = *(undefined1 *)(param_3 + 0x1a);
      *(undefined4 *)(param_1 + 0x432528) = param_3[0x1b];
      uVar11 = 0;
      do {
        *(undefined1 *)(uVar11 + 0x6c + param_1 + 0x4324c0) =
             *(undefined1 *)((int)param_3 + uVar11 + 0x70);
        uVar11 = uVar11 + 1;
      } while (uVar11 < 0x10);
      *(undefined1 *)(param_1 + 0x43253c) = *(undefined1 *)(param_3 + 0x20);
      *(undefined1 *)(param_1 + 0x43253d) = *(undefined1 *)((int)param_3 + 0x81);
      local_24 = (undefined4 *)(param_1 + 0x432540);
      local_28 = 2.8026e-45;
      do {
        puVar18 = (undefined4 *)((int)local_24 + (int)local_2c);
        puVar17 = local_24;
        for (iVar16 = 0x21; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_24 = local_24 + 0x21;
        local_28 = (float)((int)local_28 + -1);
      } while (local_28 != 0.0);
      puVar18 = (undefined4 *)(param_1 + 0x432648);
      iVar16 = 8;
      do {
        *puVar18 = *(undefined4 *)((int)puVar18 + (int)local_2c);
        puVar18 = puVar18 + 1;
        iVar16 = iVar16 + -1;
      } while (iVar16 != 0);
      *(undefined1 *)(param_1 + 0x432668) = *(undefined1 *)(param_3 + 0x6b);
      *(undefined1 *)(param_1 + 0x432669) = *(undefined1 *)((int)param_3 + 0x1ad);
      *(undefined1 *)(param_1 + 0x43266a) = *(undefined1 *)((int)param_3 + 0x1ae);
      puVar10 = (undefined2 *)(param_1 + 0x43266c);
      iVar16 = 0x50;
      do {
        *puVar10 = *(undefined2 *)((int)local_2c + (int)puVar10);
        puVar10 = puVar10 + 1;
        iVar16 = iVar16 + -1;
      } while (iVar16 != 0);
      *(undefined1 *)(param_1 + 0x43270c) = *(undefined1 *)(param_3 + 0x94);
      puVar18 = (undefined4 *)(param_1 + 0x432710);
      local_28 = 2.24208e-44;
      do {
        *puVar18 = *(undefined4 *)((int)local_2c + (int)puVar18);
        puVar18[1] = *(undefined4 *)((int)(local_2c + 2) + (int)puVar18);
        puVar18 = puVar18 + 2;
        local_28 = (float)((int)local_28 + -1);
      } while (local_28 != 0.0);
      *(undefined1 *)((int)&PTR_DAT_00432790 + param_1) = *(undefined1 *)(param_3 + 0xb5);
      FUN_004c0400(iStack_34);
      break;
    case 0x358:
      FUN_005923a0(s_NotifyChangeFlagShip_OK_00770230);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_004332d0 + local_18);
      for (iVar16 = 0x17; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = 0;
      FUN_005266e0(&DAT_004332d0 + local_18);
      break;
    case 0x359:
      FUN_005923a0(s_NotifyInformationOutfit_OK_00770268);
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_00432794 + local_18);
      for (iVar16 = 7; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      local_1c = 0;
      FUN_004c03b0(&DAT_00432794 + local_18);
      break;
    case 0x35a:
      FUN_005923a0(s_NotifyEnding_OK_00770284);
      *(undefined4 *)(&DAT_0043caa0 + param_1) = *param_3;
      puVar2 = &DAT_0043caa0 + param_1;
      *(undefined2 *)(&DAT_0043caa4 + param_1) = *(undefined2 *)(param_3 + 1);
      (&DAT_0043caa6)[param_1] = *(undefined1 *)((int)param_3 + 6);
      (&DAT_0043caa7)[param_1] = *(undefined1 *)((int)param_3 + 7);
      *(undefined4 *)(&DAT_0043caa8 + param_1) = param_3[2];
      (&DAT_0043caac)[param_1] = *(undefined1 *)(param_3 + 3);
      (&DAT_0043caad)[param_1] = *(undefined1 *)((int)param_3 + 0xd);
      *(undefined4 *)(&DAT_0043cab0 + param_1) = param_3[4];
      *(undefined2 *)(&DAT_0043cab4 + param_1) = *(undefined2 *)(param_3 + 5);
      *(undefined4 *)(&DAT_0043cab8 + param_1) = param_3[6];
      *(undefined4 *)(&DAT_0043cabc + param_1) = param_3[7];
      *(undefined4 *)(&DAT_0043cac0 + param_1) = param_3[8];
      *(undefined4 *)(&DAT_0043cac4 + param_1) = param_3[9];
      (&DAT_0043cac8)[param_1] = *(undefined1 *)(param_3 + 10);
      local_1c = 0;
      puVar10 = (undefined2 *)(&DAT_0043caca + param_1);
      iVar16 = (int)param_3 - (int)puVar2;
      iVar14 = 0xd;
      do {
        *puVar10 = *(undefined2 *)(iVar16 + (int)puVar10);
        puVar10 = puVar10 + 1;
        iVar14 = iVar14 + -1;
      } while (iVar14 != 0);
      *(undefined4 *)(&DAT_0043cae4 + param_1) = param_3[0x11];
      *(undefined4 *)(&DAT_0043cae8 + param_1) = param_3[0x12];
      *(undefined4 *)(&DAT_0043caec + param_1) = param_3[0x13];
      *(undefined4 *)(&DAT_0043caf0 + param_1) = param_3[0x14];
      *(undefined4 *)(&DAT_0043caf4 + param_1) = param_3[0x15];
      *(undefined4 *)(&DAT_0043caf8 + param_1) = param_3[0x16];
      *(undefined2 *)(&DAT_0043cafc + param_1) = *(undefined2 *)(param_3 + 0x17);
      (&DAT_0043cafe)[param_1] = *(undefined1 *)((int)param_3 + 0x5e);
      (&DAT_0043caff)[param_1] = *(undefined1 *)((int)param_3 + 0x5f);
      (&DAT_0043cb00)[param_1] = *(undefined1 *)(param_3 + 0x18);
      (&DAT_0043cb01)[param_1] = *(undefined1 *)((int)param_3 + 0x61);
      (&DAT_0043cb02)[param_1] = *(undefined1 *)((int)param_3 + 0x62);
      (&DAT_0043cb03)[param_1] = *(undefined1 *)((int)param_3 + 99);
      (&DAT_0043cb04)[param_1] = *(undefined1 *)(param_3 + 0x19);
      *(undefined4 *)(&DAT_0043cb08 + param_1) = param_3[0x1a];
      uVar11 = 0;
      do {
        puVar2[uVar11 + 0x6c] = *(undefined1 *)((int)param_3 + uVar11 + 0x6c);
        uVar11 = uVar11 + 1;
      } while (uVar11 < 0x10);
      (&DAT_0043cb1c)[param_1] = *(undefined1 *)(param_3 + 0x1f);
      (&DAT_0043cb1d)[param_1] = *(undefined1 *)((int)param_3 + 0x7d);
      local_24 = (undefined4 *)((int)&PTR_DAT_0043cb20 + param_1);
      local_28 = 2.8026e-45;
      do {
        puVar18 = (undefined4 *)((int)local_24 + iVar16);
        puVar17 = local_24;
        for (iVar14 = 0x21; iVar14 != 0; iVar14 = iVar14 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        local_24 = local_24 + 0x21;
        local_28 = (float)((int)local_28 + -1);
      } while (local_28 != 0.0);
      puVar18 = (undefined4 *)(&DAT_0043cc28 + param_1);
      iVar14 = 8;
      do {
        *puVar18 = *(undefined4 *)((int)puVar18 + iVar16);
        puVar18 = puVar18 + 1;
        iVar14 = iVar14 + -1;
      } while (iVar14 != 0);
      (&DAT_0043cc48)[param_1] = *(undefined1 *)(param_3 + 0x6a);
      (&DAT_0043cc49)[param_1] = *(undefined1 *)((int)param_3 + 0x1a9);
      (&DAT_0043cc4a)[param_1] = *(undefined1 *)((int)param_3 + 0x1aa);
      puVar10 = (undefined2 *)(&DAT_0043cc4c + param_1);
      iVar14 = 0x50;
      do {
        *puVar10 = *(undefined2 *)((int)puVar10 + iVar16);
        puVar10 = puVar10 + 1;
        iVar14 = iVar14 + -1;
      } while (iVar14 != 0);
      (&DAT_0043ccec)[param_1] = *(undefined1 *)(param_3 + 0x93);
      puVar18 = (undefined4 *)(&DAT_0043ccf0 + param_1);
      iVar14 = 0x10;
      do {
        *puVar18 = *(undefined4 *)((int)puVar18 + iVar16);
        puVar18[1] = *(undefined4 *)((int)puVar18 + iVar16 + 4);
        puVar18 = puVar18 + 2;
        iVar14 = iVar14 + -1;
      } while (iVar14 != 0);
      (&DAT_0043cd70)[param_1] = *(undefined1 *)(param_3 + 0xb4);
      puVar18 = param_3 + 0xb5;
      puVar17 = (undefined4 *)(&DAT_0043cd74 + param_1);
      for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      puVar18 = param_3 + 0xba;
      puVar17 = (undefined4 *)(&DAT_0043cd88 + param_1);
      for (iVar16 = 0x53; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004beb30(puVar2);
      break;
    case 0x400:
      FUN_005923a0(s_CommandMoveShip_OK_00770540);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_004327cc + local_18);
      for (iVar16 = 0x107; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004be8f0(&DAT_004327cc + local_18,0);
      break;
    case 0x401:
      FUN_005923a0(s_CommandTurnShip_OK_0077051c);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x432be8);
      for (iVar16 = 0x45; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bef70((undefined4 *)(local_18 + 0x432be8),0);
      break;
    case 0x402:
      FUN_005923a0(s_CommandParallelMoveShip_OK_00770500);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x432cfc);
      for (iVar16 = 0x107; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bf320((undefined4 *)(local_18 + 0x432cfc),0);
      break;
    case 0x403:
      FUN_005923a0(s_CommandReverseShip_OK_00770434);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437c08);
      for (iVar16 = 0x45; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x404:
      FUN_005923a0(s_CommandWarpShip_OK_00770420);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437d1c);
      for (iVar16 = 0x24; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bfc40((undefined4 *)(local_18 + 0x437d1c),0);
      break;
    case 0x405:
      FUN_005923a0(s_CommandAttackShip_OK_00770488);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x433184);
      for (iVar16 = 0x26; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bfc40((undefined4 *)(local_18 + 0x433184),0);
      break;
    case 0x406:
      FUN_005923a0(s_CommandShootShip_OK_00770474);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_0043321c + local_18);
      for (iVar16 = 0x26; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bfc40(&DAT_0043321c + local_18,0);
      break;
    case 0x407:
      FUN_005923a0(s_CommandFight_OK_00770410);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437dac);
      for (iVar16 = 9; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c1070((undefined4 *)(local_18 + 0x437dac),0);
      break;
    case 0x408:
      FUN_005923a0(s_CommandSuggestion_OK_00770294);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x43882c);
      for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x409:
      FUN_005923a0(s_CommandEncourageFlagship_OK_007703e0);
      local_1c = param_3[2];
      puVar18 = (undefined4 *)(param_1 + 0x437e68);
      goto LAB_004bc5bf;
    case 0x40a:
      FUN_005923a0(s_CommandStop_OK_00770530);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437af4);
      for (iVar16 = 0x45; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x40b:
      FUN_005923a0(s_CommandAdmission_OK_007702f4);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x438550);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x40c:
      FUN_005923a0(s_CommandControl_OK_00770460);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_0043332c + local_18);
      for (iVar16 = 8; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c1700(&DAT_0043332c + local_18,1);
      break;
    case 0x40d:
      FUN_005923a0(s_CommandFileFleet_OK_0077044c);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_00433368 + local_18);
      for (iVar16 = 0xa5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bf0c0(&DAT_00433368 + local_18,0);
      break;
    case 0x40e:
      FUN_005923a0(s_CommandAirBattle_OK_007703fc);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437dd0);
      for (iVar16 = 0x26; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c0a80((undefined4 *)(local_18 + 0x437dd0),0);
      break;
    case 0x40f:
      FUN_005923a0(s_CommandSortieTroops_OK_007704d0);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_0043392c + local_18);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004be8c0(&DAT_0043392c + local_18,0);
      break;
    case 0x410:
      FUN_005923a0(s_CommandEvacuateTroops_OK_007704a0);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_004339cc + local_18);
      for (iVar16 = 0x24; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004be8c0(&DAT_004339cc + local_18,0);
      break;
    case 0x411:
      FUN_005923a0(s_CommandChangeMode_OK_007704e8);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_004335fc + local_18);
      for (iVar16 = 0x26; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x412:
      FUN_005923a0(s_CommandSortie_OK_007704bc);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(&DAT_00433a70 + local_18);
      for (iVar16 = 0x24; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x413:
      FUN_005923a0(s_CommandRepairFleet_OK_007703c8);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437e78);
      for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c13a0((undefined4 *)(local_18 + 0x437e78),0);
      break;
    case 0x414:
      FUN_005923a0(s_CommandSupplyFleet_OK_007703b0);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437e8c);
      for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c14a0((undefined4 *)(local_18 + 0x437e8c),0);
      break;
    case 0x419:
      FUN_005923a0(s_CommandShootFortress_OK_00770398);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437ea0);
      for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bfa10((undefined4 *)(local_18 + 0x437ea0),0);
      break;
    case 0x41a:
      FUN_005923a0(s_CommandAdmissionBase_OK_007702dc);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4385e4);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x41b:
      FUN_005923a0(s_CommandRepairBase_OK_00770380);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437eb4);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x41c:
      FUN_005923a0(s_CommandSupplyBase_OK_00770368);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437f48);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x41d:
      FUN_005923a0(s_CommandEncourageBase_OK_00770350);
      local_1c = param_3[2];
      puVar18 = (undefined4 *)(param_1 + 0x437fdc);
LAB_004bc2b2:
      *puVar18 = *param_3;
      puVar18[1] = param_3[1];
      puVar18[2] = param_3[2];
      puVar18[3] = param_3[3];
      break;
    case 0x41e:
      FUN_005923a0(s_CommandStopBase_OK_0077033c);
      local_1c = param_3[2];
      puVar18 = (undefined4 *)(param_1 + 0x437fec);
      goto LAB_004bc5bf;
    case 0x41f:
      FUN_005923a0(s_CommandMoveFortress_OK_00770324);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x437ffc);
      for (iVar16 = 0x69; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004bf6d0((undefined4 *)(local_18 + 0x437ffc),0);
      break;
    case 0x420:
      FUN_005923a0(s_CommandChangeAuthority_OK_007702c0);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x438678);
      for (iVar16 = 0x25; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      FUN_004c08e0((undefined4 *)(local_18 + 0x438678),0);
      break;
    case 0x421:
      FUN_005923a0(s_CommandMission_OK_007702ac);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x438794);
      for (iVar16 = 0x26; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
      break;
    case 0x422:
      FUN_005923a0(s_CommandEmergencySupply_OK_00770308);
      local_1c = param_3[2];
      puVar18 = param_3;
      puVar17 = (undefined4 *)(local_18 + 0x4381a0);
      for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
        *puVar17 = *puVar18;
        puVar18 = puVar18 + 1;
        puVar17 = puVar17 + 1;
      }
    }
    goto LAB_004bdd33;
  }
  if (0x500 < local_3c) {
    if (local_3c < 0x70a) {
      if (local_3c == 0x709) {
        FUN_005923a0(s_CommandCardResignation_OK_0076fe88);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(&DAT_0043c990 + local_18);
        for (iVar16 = 0x27; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bfcd0(&DAT_0043c990 + local_18,0);
        goto LAB_004bdd33;
      }
      if (local_3c < 0x707) {
        if (local_3c == 0x706) {
          FUN_005923a0(s_CommandRankDown_OK_0076fed8);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x43c820);
          for (iVar16 = 0x2a; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0((undefined4 *)(local_18 + 0x43c820),0);
          goto LAB_004bdd33;
        }
        if (local_3c == 0x501) {
          FUN_005923a0(s_NotifyError_OK_0076feec);
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_00448704 + local_18);
          for (iVar16 = 0x40; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          *(undefined2 *)puVar17 = *(undefined2 *)puVar18;
          FUN_005923a0(&DAT_00448706 + local_18,0x44a02000);
          goto LAB_004bdd33;
        }
        if (local_3c == 0x704) {
          FUN_005923a0(s_CommandRankUp_OK_0076fefc);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x438858);
          for (iVar16 = 0x28; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0((undefined4 *)(local_18 + 0x438858),0);
          goto LAB_004bdd33;
        }
        if (local_3c == 0x705) {
          FUN_005923a0(s_CommandSpeciallyRankUp_OK_0076ff10);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(local_18 + 0x4388f8);
          for (iVar16 = 0xfca; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0((undefined4 *)(local_18 + 0x4388f8),0);
          goto LAB_004bdd33;
        }
      }
      else {
        if (local_3c == 0x707) {
          FUN_005923a0(s_CommandCardAppointment_OK_0076fea4);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)((int)&PTR_s__Input_CommandSpeciallyRankUp_i_0043c8c8 + local_18);
          for (iVar16 = 10; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004c5580((undefined4 *)
                       ((int)&PTR_s__Input_CommandSpeciallyRankUp_i_0043c8c8 + local_18),0);
          goto LAB_004bdd33;
        }
        if (local_3c == 0x708) {
          FUN_005923a0(s_CommandCardDismisal_OK_0076fec0);
          local_1c = param_3[1];
          puVar18 = param_3;
          puVar17 = (undefined4 *)(&DAT_0043c8f0 + local_18);
          for (iVar16 = 0x28; iVar16 != 0; iVar16 = iVar16 + -1) {
            *puVar17 = *puVar18;
            puVar18 = puVar18 + 1;
            puVar17 = puVar17 + 1;
          }
          FUN_004bfcd0(&DAT_0043c8f0 + local_18,0);
          goto LAB_004bdd33;
        }
      }
    }
    else if (local_3c < 0x901) {
      if (local_3c == 0x900) {
        FUN_005923a0(s_CommandMakePlan_OK_0076fe44);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x43ca2c);
        for (iVar16 = 7; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bfcd0((undefined4 *)(local_18 + 0x43ca2c),0);
        goto LAB_004bdd33;
      }
      if (local_3c == 0x70a) {
        FUN_005923a0(s_NotifyCardLoss_OK_0076fe58);
        local_1c = 0;
        *(undefined4 *)(&DAT_004327b0 + param_1) = *param_3;
        *(undefined4 *)(&DAT_004327b4 + param_1) = param_3[1];
        *(undefined4 *)(&DAT_004327b8 + param_1) = param_3[2];
        FUN_004c0670(&DAT_004327b0 + param_1);
        goto LAB_004bdd33;
      }
      if (local_3c == 0x70b) {
        FUN_005923a0(s_NotifyCardLossMovedSpot_OK_0076fe6c);
        local_1c = 0;
        *(undefined4 *)(&DAT_004327bc + param_1) = *param_3;
        *(undefined4 *)(&DAT_004327c0 + param_1) = param_3[1];
        *(undefined4 *)(&DAT_004327c4 + param_1) = param_3[2];
        *(undefined4 *)(&DAT_004327c8 + param_1) = param_3[3];
        FUN_004c0790(&DAT_004327bc + param_1);
        goto LAB_004bdd33;
      }
    }
    else {
      if (local_3c == 0x901) {
        FUN_005923a0(s_CommandWithdrawalPlan_OK_0076fe10);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x43ca48);
        for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bfcd0((undefined4 *)(local_18 + 0x43ca48),0);
        goto LAB_004bdd33;
      }
      if (local_3c == 0x902) {
        FUN_005923a0(s_CommandAnnouncement_OK_0076fe2c);
        local_1c = param_3[1];
        puVar18 = param_3;
        puVar17 = (undefined4 *)(local_18 + 0x43ca60);
        for (iVar16 = 10; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar17 = *puVar18;
          puVar18 = puVar18 + 1;
          puVar17 = puVar17 + 1;
        }
        FUN_004bfcd0((undefined4 *)(local_18 + 0x43ca60),0);
        goto LAB_004bdd33;
      }
    }
    goto switchD_004ba340_caseD_203;
  }
  if (local_3c == 0x500) {
    FUN_005923a0(s_NotifyInvalidMessage_OK_0076ff50);
    local_314 = (undefined4 *)(&DAT_00448600 + local_18);
    puVar18 = param_3;
    puVar17 = local_314;
    for (iVar16 = 0x41; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    uVar11 = (uint)(byte)(&DAT_00448603)[local_18];
    if (0x108 < uVar11) {
      uVar11 = 0xff;
    }
    (&DAT_00448603)[local_18] = (char)uVar11;
    *(undefined2 *)(&LAB_00448604 + uVar11 * 2 + local_18) = 0;
    local_318 = 0x500;
    iVar16 = *DAT_02215e2c;
    if (iVar16 == 1) {
      iVar16 = FUN_0050cf40(9);
      if (iVar16 == 0) {
        FUN_005923a0(&DAT_0076ff2c,0);
        *(undefined4 *)(local_18 + 0x357ec0) = 0;
        goto LAB_004bdd33;
      }
LAB_004bc75f:
      puVar23 = local_344;
      uVar12 = FUN_00502780(0,0);
      FUN_00501e30(0x17,uVar12,puVar23);
    }
    else {
      if (iVar16 == 2) {
        iVar16 = FUN_0050cf40(0x6f);
        if (iVar16 == 0) {
          FUN_005923a0(&DAT_0076ff2c,0);
        }
        else {
          puVar23 = local_344;
          uVar12 = FUN_00502780(0,0);
          FUN_00501e30(0x17,uVar12,puVar23);
        }
        iVar16 = FUN_0050cf40(9);
        if (iVar16 == 0) {
          FUN_005923a0(&DAT_0076ff2c,0);
        }
        else {
          puVar23 = local_344;
          uVar12 = FUN_00502780(0,0);
          FUN_00501e30(0x17,uVar12,puVar23);
        }
        puVar18 = (undefined4 *)(DAT_007ccffc + 0x485764);
        for (iVar16 = 0x93; iVar16 != 0; iVar16 = iVar16 + -1) {
          *puVar18 = 0;
          puVar18 = puVar18 + 1;
        }
        *(undefined4 *)(local_18 + 0x357ec0) = 0;
        goto LAB_004bdd33;
      }
      if (iVar16 == 3) {
        iVar16 = FUN_0050cf40(0x56);
        if (iVar16 == 0) {
          FUN_005923a0(&DAT_0076ff2c,0);
          *(undefined4 *)(local_18 + 0x357ec0) = 0;
          goto LAB_004bdd33;
        }
        goto LAB_004bc75f;
      }
    }
    *(undefined4 *)(local_18 + 0x357ec0) = 0;
    goto LAB_004bdd33;
  }
  switch(local_3c) {
  case 0x424:
    FUN_005923a0(s_NotifyTurnedShip_OK_00770140);
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x433134) = *param_3;
    *(undefined4 *)(param_1 + 0x433138) = param_3[1];
    *(undefined4 *)(param_1 + 0x43313c) = param_3[2];
    FUN_004bf970((undefined4 *)(param_1 + 0x433134));
    break;
  case 0x425:
    FUN_005923a0(s_NotifyWarpedShip_OK_0077002c);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(local_18 + 0x4381b4);
    for (iVar16 = 0x24; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c1990((undefined4 *)(local_18 + 0x4381b4));
    break;
  case 0x426:
    FUN_005923a0(s_NotifyAttackedShip_OK_007700c4);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_004332b4 + local_18);
    for (iVar16 = 7; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c0df0(&DAT_004332b4 + local_18);
    break;
  case 0x427:
    FUN_005923a0(s_NotifyFought_OK_0077001c);
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x438244) = *param_3;
    *(undefined4 *)(param_1 + 0x438248) = param_3[1];
    *(undefined4 *)(param_1 + 0x43824c) = param_3[2];
    *(undefined4 *)(param_1 + 0x438250) = param_3[3];
    FUN_004c1130((undefined4 *)(param_1 + 0x438244));
    break;
  case 0x428:
    FUN_005923a0(s_NotifyAirBattle_OK_00770008);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(local_18 + 0x438254);
    for (iVar16 = 6; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c0c80((undefined4 *)(local_18 + 0x438254));
    break;
  case 0x429:
    FUN_005923a0(s_NotifyMovedTroop_OK_00770154);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00433a5c + local_18);
    for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c1210(&DAT_00433a5c + local_18);
    break;
  case 0x42a:
    FUN_005923a0(s_NotifyLandCombat_OK_00770090);
    local_1c = 0;
    *(undefined4 *)(&DAT_004339c0 + param_1) = *param_3;
    *(undefined4 *)((int)&PTR_FUN_004339c4 + param_1) = param_3[1];
    *(undefined4 *)(&DAT_004339c8 + param_1) = param_3[2];
    FUN_004c12b0(&DAT_004339c0 + param_1);
    break;
  default:
    goto switchD_004ba340_caseD_203;
  case 0x42c:
    FUN_005923a0(s_NotifyEncourageFlagship_OK_0076ffec);
    local_1c = 0;
    puVar18 = param_3;
    puVar17 = (undefined4 *)(local_18 + 0x43826c);
    for (iVar16 = 0x3f; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    break;
  case 0x42d:
    FUN_005923a0(s_NotifyRepairFleet_OK_0076ffd4);
    local_1c = 0;
    *(undefined4 *)(&DAT_00438368 + param_1) = *param_3;
    *(undefined4 *)(&DAT_0043836c + param_1) = param_3[1];
    *(undefined4 *)((int)&PTR_DAT_00438370 + param_1) = param_3[2];
    *(undefined4 *)(&DAT_00438374 + param_1) = param_3[3];
    FUN_004c15a0(&DAT_00438368 + param_1);
    break;
  case 0x42e:
    FUN_005923a0(s_NotifySupplyFleet_OK_0076ffbc);
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x438414) = *param_3;
    *(undefined4 *)((int)&PTR_DAT_00438418 + param_1) = param_3[1];
    *(undefined4 *)(&DAT_0043841c + param_1) = param_3[2];
    *(undefined4 *)(&DAT_00438420 + param_1) = param_3[3];
    FUN_004c1680((undefined4 *)(param_1 + 0x438414));
    break;
  case 0x42f:
    FUN_005923a0(s_NotifyChangeMode_OK_00770168);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00433694 + local_18);
    for (iVar16 = 0xa6; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c1c30(&DAT_00433694 + local_18);
    break;
  case 0x431:
    FUN_005923a0(s_NotifyTacticsChiefCommander_OK_007700a4);
    local_1c = param_3[1];
    *(undefined4 *)(&DAT_0043334c + param_1) = *param_3;
    *(undefined4 *)(&DAT_00433350 + param_1) = param_3[1];
    break;
  case 0x432:
    FUN_005923a0(s_NotifyEncourageBase_OK_00770060);
    local_1c = 0;
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00438444 + local_18);
    for (iVar16 = 0x3f; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    break;
  case 0x433:
    FUN_005923a0(s_NotifyRepairBase_OK_0076ff7c);
    local_1c = 0;
    puVar18 = (undefined4 *)(&DAT_00438424 + param_1);
    goto LAB_004bc5bf;
  case 0x434:
    FUN_005923a0(s_NotifySupplyBase_OK_0076ff68);
    local_1c = 0;
    puVar18 = (undefined4 *)(&DAT_00438434 + param_1);
    goto LAB_004bc5bf;
  case 0x435:
    FUN_005923a0(s_NotifyMovedFortress_OK_00770078);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00433354 + local_18);
    for (iVar16 = 5; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004bf7b0(&DAT_00433354 + local_18);
    break;
  case 0x436:
    FUN_005923a0(s_NotifyShootFortress_OK_0076ffa4);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00438378 + local_18);
    for (iVar16 = 0x23; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004bfb70(&DAT_00438378 + local_18);
    break;
  case 0x437:
    FUN_005923a0(s_NotifySortie_OK_00770198);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(&DAT_00433b00 + local_18);
    for (iVar16 = 7; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c1a80(&DAT_00433b00 + local_18);
    break;
  case 0x438:
    FUN_005923a0(s_NotifyEmergencySupplyBase_OK_00770040);
    *(undefined4 *)(param_1 + 0x438540) = *param_3;
    *(undefined4 *)(param_1 + 0x438544) = param_3[1];
    *(undefined4 *)(param_1 + 0x438548) = param_3[2];
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x43854c) = param_3[3];
    break;
  case 0x439:
    FUN_005923a0(s_NotifyChangedAuthority_OK_007701a8);
    puVar18 = param_3;
    puVar17 = (undefined4 *)(local_18 + 0x43870c);
    for (iVar16 = 0x22; iVar16 != 0; iVar16 = iVar16 + -1) {
      *puVar17 = *puVar18;
      puVar18 = puVar18 + 1;
      puVar17 = puVar17 + 1;
    }
    local_1c = 0;
    FUN_004c09e0((undefined4 *)(local_18 + 0x43870c));
    break;
  case 0x43a:
    FUN_005923a0(s_NotifyCharacterAchievement_OK_007701fc);
    local_1c = param_3[1];
    puVar18 = (undefined4 *)(param_1 + 0x43315c);
    goto LAB_004bc063;
  case 0x43b:
    FUN_005923a0(s_NotifyOutfitAchievement_OK_007701e0);
    local_1c = param_3[1];
    puVar18 = (undefined4 *)(param_1 + 0x433168);
    goto LAB_004bc093;
  case 0x43c:
    FUN_005923a0(s_NotifyMissionResult_OK_007700dc);
    local_1c = 0;
    puVar18 = (undefined4 *)(param_1 + 0x433174);
    goto LAB_004bc2b2;
  case 0x43d:
    FUN_005923a0(s_NotifyConfusionUnit_OK_00770114);
    *(undefined4 *)(param_1 + 0x43314c) = *param_3;
    *(undefined4 *)(param_1 + 0x433150) = param_3[1];
    local_1c = 0;
    FUN_004c0c00((undefined4 *)(param_1 + 0x43314c));
    break;
  case 0x43e:
    FUN_005923a0(s_NotifyConfusionRecoveredUnit_OK_007700f4);
    *(undefined4 *)(param_1 + 0x433154) = *param_3;
    *(undefined4 *)(param_1 + 0x433158) = param_3[1];
    local_1c = 0;
    FUN_004c0c40((undefined4 *)(param_1 + 0x433154));
    break;
  case 0x43f:
    FUN_005923a0(s_NotifyShootBase_OK_0076ff90);
    local_1c = 0;
    puVar18 = (undefined4 *)(param_1 + 0x438404);
LAB_004bc5bf:
    *puVar18 = *param_3;
    puVar18[1] = param_3[1];
    puVar18[2] = param_3[2];
    puVar18[3] = param_3[3];
    break;
  case 0x440:
    FUN_005923a0(s_NotifyMoraleDown_OK_0077012c);
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x433140) = *param_3;
    *(undefined4 *)(param_1 + 0x433144) = param_3[1];
    *(undefined4 *)(param_1 + 0x433148) = param_3[2];
    FUN_004c0bc0((undefined4 *)(param_1 + 0x433140));
    break;
  case 0x441:
    FUN_005923a0(s_NotifyBlackHoleSuction_OK_0077017c);
    local_1c = 0;
    *(undefined4 *)(param_1 + 0x437af0) = *param_3;
    FUN_004bedd0((undefined4 *)(param_1 + 0x437af0));
    break;
  case 0x442:
    FUN_005923a0(s_NotifyFinishOccupation_OK_007701c4);
    *(undefined4 *)(&DAT_0043ca98 + param_1) = *param_3;
    local_1c = 0;
    *(undefined4 *)(&DAT_0043ca9c + param_1) = param_3[1];
    FUN_004beba0(&DAT_0043ca98 + param_1);
  }
LAB_004bdd33:
  iVar14 = local_18;
  iVar16 = local_1c;
  *(undefined1 *)(local_18 + 0x3579cc) = 0;
  if (bVar8) {
    *(undefined1 *)(local_18 + 0x3579cc) = 1;
  }
  if (local_1c == *(int *)(local_18 + 0x3584a0)) {
    FUN_004be350(local_3c,param_3);
  }
  iVar13 = 0;
  while( true ) {
    if (*(int *)(iVar14 + 0x357ec0) <= iVar13) {
      ExceptionList = local_10;
      return;
    }
    if (((iVar16 == -1) || (iVar16 == *(int *)(iVar14 + 0x3584a0))) &&
       (iVar16 = local_1c, (param_2 & 0xffff) == *(uint *)(iVar14 + 0x357ec8 + iVar13 * 0xc)))
    break;
    iVar13 = iVar13 + 1;
  }
  iVar16 = iVar13 + 1;
  if (iVar16 < *(int *)(iVar14 + 0x357ec0)) {
    puVar18 = (undefined4 *)(iVar14 + (iVar13 * 3 + 0xd5fb1) * 4);
    do {
      *puVar18 = puVar18[3];
      puVar18[1] = puVar18[4];
      puVar18[2] = puVar18[5];
      iVar16 = iVar16 + 1;
      puVar18 = puVar18 + 3;
    } while (iVar16 < *(int *)(iVar14 + 0x357ec0));
  }
  iVar16 = *(int *)(iVar14 + 0x357ec0) + -1;
  *(int *)(iVar14 + 0x357ec0) = iVar16;
  if (iVar16 < 1) {
    ExceptionList = local_10;
    return;
  }
  if (DAT_007c25f4 == 0) {
    ExceptionList = local_10;
    return;
  }
  local_8 = 0;
  (**(code **)(**(int **)(DAT_007c25f4 + 0x44) + 0x18))
            (*(undefined4 *)(DAT_007c25f4 + 0x40),*(undefined2 *)(iVar14 + 0x357ec4),
             *(undefined4 *)(iVar14 + 0x357ecc));
  ExceptionList = local_10;
  return;
}


