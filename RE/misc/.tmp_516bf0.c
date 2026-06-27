// EXACT  0x00516bf0  FUN_00516bf0  undefined FUN_00516bf0()

/* WARNING: Type propagation algorithm not settling */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00516bf0(int param_1,int **param_2,int **param_3)

{
  undefined4 *puVar1;
  undefined4 *puVar2;
  char cVar3;
  int iVar4;
  int *piVar5;
  int *piVar6;
  int iVar7;
  undefined4 uVar8;
  undefined *puVar9;
  undefined1 *puVar10;
  int *piStack_68;
  int local_54 [2];
  undefined4 *local_4c;
  undefined4 uStack_48;
  undefined4 local_44;
  undefined1 local_40 [44];
  int local_14;
  int local_10;
  void *local_c;
  undefined1 *puStack_8;
  char local_4 [4];
  
  local_4[0] = -1;
  local_4[1] = -1;
  local_4[2] = -1;
  local_4[3] = -1;
  puStack_8 = &LAB_00664598;
  local_c = ExceptionList;
  piStack_68 = (int *)param_2;
  ExceptionList = &local_c;
  iVar4 = FUN_0050cf40();
  piStack_68 = local_54;
  local_54[0] = 0;
  local_54[1] = 0;
  FUN_0050b2b0((int *)(iVar4 + 0x38),local_54 + 1);
  piStack_68 = (int *)(iVar4 + 0x38);
  iVar4 = FUN_00502980();
  param_2 = (int **)(((float)local_54[0] * _DAT_0066e688) / (float)*(int *)(iVar4 + 0x10));
  piStack_68 = (int *)param_2;
  FUN_00507ca0(0,0,0);
  piStack_68 = (int *)param_3;
  local_44 = FUN_0050cf40();
  param_2 = (int **)((uint)param_2 & 0xffffff00);
  if ((*(int *)(*(int *)(DAT_007ccffc + 8) + 0x40) == 0) ||
     (*(char *)(DAT_007ccffc + 0x126718) != '\0')) {
    piStack_68 = (int *)0x1;
    FUN_00508890(1,8,10);
    piStack_68 = (int *)0x1;
    FUN_00508840(1,8,10);
    piStack_68 = (int *)0x516d02;
    iVar4 = FUN_004b5ba0();
    if (iVar4 == 0) {
      piStack_68 = (int *)0x0;
      FUN_00508890(1,9,9);
      piStack_68 = (int *)0x0;
      FUN_00508840(1,9,9);
    }
    piVar6 = (int *)0x8;
    do {
      piStack_68 = piVar6;
      piVar5 = (int *)FUN_00502780(1);
      piStack_68 = (int *)0x0;
      cVar3 = FUN_005015f0(9,piVar5,local_40);
      if (cVar3 != '\0') {
        piStack_68 = (int *)0x0;
        FUN_005088e0(1,8,10,0);
        piStack_68 = (int *)0x0;
        FUN_005088e0(1,piVar6,piVar6,0xffffffff);
        break;
      }
      piStack_68 = piVar5;
      iVar4 = FUN_00502a40();
      if (iVar4 == -1) {
        param_1 = CONCAT13((char)((uint)param_1 >> 0x18),0x10200);
        DAT_02216702 = local_4[(int)piVar6];
      }
      piVar6 = (int *)((int)piVar6 + 1);
    } while ((int)piVar6 < 0xb);
  }
  else {
    piStack_68 = (int *)0x0;
    FUN_00508890(1,8,10);
    piStack_68 = (int *)0x0;
    FUN_00508840(1,8,10);
    piStack_68 = (int *)0x0;
    FUN_005088e0(1,8,10,0);
    param_2 = (int **)CONCAT31(param_2._1_3_,1);
  }
  piStack_68 = (int *)0x0;
  piVar6 = (int *)FUN_00502780(3);
  piStack_68 = (int *)0x516da5;
  cVar3 = FUN_005024a0();
  if ((cVar3 != '\0') && (piStack_68 = piVar6, cVar3 = FUN_005025c0(), cVar3 != '\0')) {
    piStack_68 = piVar6;
    piStack_68 = (int *)FUN_00504ea0();
    FUN_004eacf0(&param_1);
    puVar1 = *(undefined4 **)(param_1 + -8);
    local_4[0] = '\0';
    local_4[1] = '\0';
    local_4[2] = '\0';
    local_4[3] = '\0';
    if (puVar1 != (undefined4 *)0x0) {
      piStack_68 = (int *)s_Japanese_0076e3fc;
      FUN_005ffcc1(0);
      if (puVar1 < (undefined4 *)0x100) {
        if (puVar1 != (undefined4 *)0x0) {
          if ((char)param_2 == '\0') {
            piStack_68 = (int *)&DAT_0078645c;
            FUN_005923a0();
            uVar8 = FUN_004eac60(param_1);
            FUN_004b5600(uVar8,DAT_02216702);
          }
          else {
            piStack_68 = (int *)&DAT_00786488;
            FUN_005923a0();
            uVar8 = FUN_004eac60(param_1);
            FUN_004b5690(uVar8);
          }
        }
      }
      else {
        uStack_48 = 0;
        param_2 = (int **)(float)puVar1;
        piStack_68 = (int *)param_2;
        local_4c = puVar1;
        FUN_005923a0(s_CHAT_TEXTBUF_MAXSIZE_over____007864b4);
      }
      piStack_68 = piVar6;
      piStack_68 = (int *)FUN_00504bf0();
      FUN_004ea880();
    }
    local_4[0] = -1;
    local_4[1] = -1;
    local_4[2] = -1;
    local_4[3] = -1;
    piStack_68 = (int *)0x516e93;
    FUN_0064c0d6();
  }
  piStack_68 = (int *)0x516e9a;
  cVar3 = FUN_005024a0();
  iVar4 = DAT_007ccffc;
  if (cVar3 == '\0') goto LAB_00517113;
  puVar1 = (undefined4 *)(DAT_007ccffc + 0x3550a8);
  piStack_68 = (int *)(DAT_007ccffc + 0x3550b4);
  local_4c = puVar1;
  param_2 = (int **)FUN_005226f0();
  puVar2 = *(undefined4 **)(iVar4 + 0x3550ac);
  if ((undefined4 *)0x100 < puVar2) {
    uStack_48 = 0;
    param_2 = (int **)(float)puVar2;
    piStack_68 = (int *)param_2;
    local_4c = puVar2;
    FUN_005923a0(s_CHAT_TEXTBUF_MAXSIZE_over____007864b4);
    goto LAB_00517113;
  }
  if (puVar2 == (undefined4 *)0x0) goto LAB_00517113;
  piStack_68 = (int *)0x3;
  piVar6 = (int *)FUN_00502780(2);
  piStack_68 = (int *)*puVar1;
  param_3 = (int **)FUN_004c7290();
  iVar4 = FUN_004c7300(*puVar1);
  iVar7 = FUN_004eae10(piVar6 + 0x2c1);
  if (10000 < iVar7) {
    piStack_68 = (int *)0xa;
    FUN_004ead70(piVar6 + 0x2c1);
  }
  piVar5 = (int *)param_3;
  if (param_3 == (int **)0x0) {
    piStack_68 = (int *)&DAT_00786440;
    FUN_00503610(piVar6);
    piStack_68 = (int *)param_2;
    FUN_00503610(piVar6);
    piStack_68 = (int *)&DAT_00786440;
LAB_005170e9:
    FUN_00503610(piVar6);
LAB_005170f1:
    piStack_68 = (int *)&DAT_0078541c;
    FUN_00503610(piVar6);
  }
  else if (iVar4 != 0) {
    if (*(char *)(iVar4 + 4) == '\x02') {
      if (*(char *)(iVar4 + 0x5e) == '\0') {
        puVar9 = &DAT_00786454;
      }
      else {
        puVar9 = &DAT_00786458;
      }
      param_3 = &piStack_68;
      FUN_0064c144(puVar9);
      FUN_005035a0(piVar6);
      piStack_68 = (int *)((int)piVar5 + 0x3a);
      FUN_00503610(piVar6);
      param_3 = &piStack_68;
      FUN_0064c144(&DAT_00786450);
      FUN_005035a0(piVar6);
      piStack_68 = (int *)param_2;
      FUN_00503610(piVar6);
      param_2 = &piStack_68;
      if (*(char *)(iVar4 + 0x5e) == '\0') {
        FUN_0064c144(&DAT_00786454);
        FUN_005035a0(piVar6);
      }
      else {
        param_2 = &piStack_68;
        FUN_0064c144(&DAT_00786458);
        FUN_005035a0(piVar6);
      }
    }
    else {
      if (*(char *)(iVar4 + 4) != '\x03') {
        piStack_68 = (int *)((int)param_3 + 0x3a);
        FUN_00503610(piVar6);
        param_3 = &piStack_68;
        FUN_0064c144(&DAT_00786450);
        FUN_005035a0(piVar6);
        piStack_68 = (int *)param_2;
        goto LAB_005170e9;
      }
      if (*(char *)(iVar4 + 0x5e) == '\0') {
        puVar9 = &DAT_00786448;
      }
      else {
        puVar9 = &DAT_0078644c;
      }
      param_3 = &piStack_68;
      FUN_0064c144(puVar9);
      FUN_005035a0(piVar6);
      piStack_68 = (int *)((int)piVar5 + 0x3a);
      FUN_00503610(piVar6);
      param_3 = &piStack_68;
      FUN_0064c144(&DAT_00786450);
      FUN_005035a0(piVar6);
      piStack_68 = (int *)param_2;
      FUN_00503610(piVar6);
      param_2 = &piStack_68;
      if (*(char *)(iVar4 + 0x5e) == '\0') {
        FUN_0064c144(&DAT_00786448);
        FUN_005035a0(piVar6);
      }
      else {
        param_2 = &piStack_68;
        FUN_0064c144(&DAT_0078644c);
        FUN_005035a0(piVar6);
      }
    }
    goto LAB_005170f1;
  }
  piStack_68 = piVar6;
  FUN_00507c40();
  local_4c[1] = 0;
LAB_00517113:
  piStack_68 = (int *)0x0;
  puVar10 = local_40;
  uVar8 = FUN_00502780(0,0);
  cVar3 = FUN_005015f0(0x17,uVar8,puVar10);
  if (((cVar3 != '\0') && (local_10 != 0)) && (local_14 == 0x500)) {
    param_2 = (int **)local_10;
    if (*(char *)(local_10 + 3) != '\0') {
      piStack_68 = (int *)0x1;
      piVar6 = (int *)FUN_00502780(2);
      piStack_68 = piVar6 + 0x2c1;
      iVar4 = FUN_004eae10();
      if (3000 < iVar4) {
        piStack_68 = (int *)0x3;
        FUN_004ead70(piVar6 + 0x2c1);
      }
      piStack_68 = (int *)&DAT_00786440;
      FUN_00503610(piVar6);
      piStack_68 = (int *)((int)param_2 + 4);
      FUN_00503610(piVar6);
      piStack_68 = (int *)&DAT_00786438;
      FUN_00503610(piVar6);
      *(char *)(local_10 + 3) = '\0';
      piStack_68 = piVar6;
      FUN_00507c40();
    }
  }
  ExceptionList = local_c;
  return;
}


