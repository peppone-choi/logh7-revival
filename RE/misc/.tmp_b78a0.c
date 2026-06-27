// EXACT  0x004b78a0  FUN_004b78a0  undefined FUN_004b78a0()

uint __thiscall FUN_004b78a0(int param_1,char param_2,uint param_3,undefined4 param_4)

{
  int iVar1;
  undefined3 uVar4;
  DWORD DVar2;
  uint uVar3;
  int iVar5;
  undefined4 uVar6;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
  local_8 = 0xffffffff;
  puStack_c = &LAB_006624d0;
  local_10 = ExceptionList;
  iVar5 = -1;
  iVar1 = (param_3 & 0xffff) - 1;
  uVar4 = (undefined3)((uint)iVar1 >> 8);
  switch(iVar1) {
  case 0:
    iVar5 = 0x201;
    iVar1 = 0x200;
    ExceptionList = &local_10;
    break;
  case 1:
    iVar5 = 0x7001;
    iVar1 = 0x7000;
    ExceptionList = &local_10;
    break;
  case 2:
    iVar5 = 0x206;
    iVar1 = 0x205;
    ExceptionList = &local_10;
    break;
  case 3:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x204;
    iVar1 = 0x203;
    ExceptionList = &local_10;
    break;
  case 4:
    iVar5 = 0x2001;
    iVar1 = 0x2000;
    ExceptionList = &local_10;
    break;
  case 5:
    iVar5 = 0x2004;
    iVar1 = 0x2003;
    ExceptionList = &local_10;
    break;
  case 6:
    iVar5 = 0x2006;
    iVar1 = 0x2005;
    ExceptionList = &local_10;
    break;
  case 7:
    iVar5 = 0x200a;
    iVar1 = 0x2009;
    ExceptionList = &local_10;
    break;
  case 8:
    iVar5 = 0x1001;
    iVar1 = 0x1000;
    ExceptionList = &local_10;
    break;
  case 9:
    iVar5 = 0x1003;
    iVar1 = 0x1001;
    ExceptionList = &local_10;
    break;
  case 10:
    iVar5 = 0x1005;
    iVar1 = 0x1004;
    ExceptionList = &local_10;
    break;
  case 0xb:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x358375));
    if (*(char *)(param_1 + 0x358375) == '\0') goto LAB_004b8516;
    iVar1 = 0x1006;
    ExceptionList = &local_10;
    break;
  case 0xc:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x358375));
    if (*(char *)(param_1 + 0x358375) == '\0') goto LAB_004b8516;
    iVar1 = 0x1007;
    ExceptionList = &local_10;
    break;
  case 0xd:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x358375));
    if (*(char *)(param_1 + 0x358375) == '\0') goto LAB_004b8516;
    iVar1 = 0x1008;
    ExceptionList = &local_10;
    break;
  case 0xe:
    iVar5 = 0x32d;
    iVar1 = 0x32c;
    ExceptionList = &local_10;
    break;
  case 0xf:
    iVar5 = 0x32f;
    iVar1 = 0x32e;
    ExceptionList = &local_10;
    break;
  case 0x10:
    iVar5 = 0x331;
    iVar1 = 0x330;
    ExceptionList = &local_10;
    break;
  case 0x11:
    iVar5 = 0x329;
    iVar1 = 0x328;
    ExceptionList = &local_10;
    break;
  case 0x12:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xf01;
    iVar1 = 0xf00;
    ExceptionList = &local_10;
    break;
  case 0x13:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xf03;
    iVar1 = 0xf02;
    ExceptionList = &local_10;
    break;
  case 0x14:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    ExceptionList = &local_10;
    *(undefined4 *)(param_1 + 0x36a5dc) = 0;
    iVar5 = 0x323;
    iVar1 = 0x322;
    break;
  case 0x15:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x34f;
    iVar1 = 0x34e;
    ExceptionList = &local_10;
    break;
  case 0x16:
    iVar5 = 0x327;
    iVar1 = 0x326;
    ExceptionList = &local_10;
    break;
  case 0x17:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x32b;
    iVar1 = 0x32a;
    ExceptionList = &local_10;
    break;
  case 0x18:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x337;
    iVar1 = 0x336;
    ExceptionList = &local_10;
    break;
  case 0x19:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x305;
    iVar1 = 0x304;
    ExceptionList = &local_10;
    break;
  case 0x1a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x307;
    iVar1 = 0x306;
    ExceptionList = &local_10;
    break;
  case 0x1b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x315;
    iVar1 = 0x314;
    ExceptionList = &local_10;
    break;
  case 0x1c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x313;
    iVar1 = 0x312;
    ExceptionList = &local_10;
    break;
  case 0x1d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x31d;
    iVar1 = 0x31c;
    ExceptionList = &local_10;
    break;
  case 0x1e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x311;
    iVar1 = 0x310;
    ExceptionList = &local_10;
    break;
  case 0x1f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x30f;
    iVar1 = 0x30e;
    ExceptionList = &local_10;
    break;
  case 0x20:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 799;
    iVar1 = 0x31e;
    ExceptionList = &local_10;
    break;
  case 0x21:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x321;
    iVar1 = 800;
    ExceptionList = &local_10;
    break;
  case 0x22:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x345;
    iVar1 = 0x344;
    ExceptionList = &local_10;
    break;
  case 0x23:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x347;
    iVar1 = 0x346;
    ExceptionList = &local_10;
    break;
  case 0x24:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x33f;
    iVar1 = 0x33e;
    ExceptionList = &local_10;
    break;
  case 0x25:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x309;
    iVar1 = 0x308;
    ExceptionList = &local_10;
    break;
  case 0x26:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x341;
    iVar1 = 0x340;
    ExceptionList = &local_10;
    break;
  case 0x27:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x30b;
    iVar1 = 0x30a;
    ExceptionList = &local_10;
    break;
  case 0x28:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x30d;
    iVar1 = 0x30c;
    ExceptionList = &local_10;
    break;
  default:
    ExceptionList = &local_10;
    uVar3 = FUN_005923a0(&DAT_0076f248,(float)(param_3 & 0xffff));
    goto LAB_004b8516;
  case 0x2a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x33b;
    iVar1 = 0x33a;
    ExceptionList = &local_10;
    break;
  case 0x2b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x325;
    iVar1 = 0x324;
    ExceptionList = &local_10;
    break;
  case 0x2c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x317;
    iVar1 = 0x316;
    ExceptionList = &local_10;
    break;
  case 0x2d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x349;
    iVar1 = 0x348;
    ExceptionList = &local_10;
    break;
  case 0x2e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x34b;
    iVar1 = 0x34a;
    ExceptionList = &local_10;
    break;
  case 0x2f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    ExceptionList = &local_10;
    DVar2 = timeGetTime();
    *(DWORD *)(param_1 + 0x357eac) = DVar2;
    iVar5 = 0x301;
    iVar1 = 0x300;
    break;
  case 0x30:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x400;
    ExceptionList = &local_10;
    break;
  case 0x31:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x401;
    ExceptionList = &local_10;
    break;
  case 0x32:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x402;
    ExceptionList = &local_10;
    break;
  case 0x33:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x405;
    ExceptionList = &local_10;
    break;
  case 0x34:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x406;
    ExceptionList = &local_10;
    break;
  case 0x35:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x40c;
    iVar1 = 0x40c;
    ExceptionList = &local_10;
    break;
  case 0x36:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x411;
    ExceptionList = &local_10;
    break;
  case 0x37:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x40f;
    ExceptionList = &local_10;
    break;
  case 0x38:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x410;
    ExceptionList = &local_10;
    break;
  case 0x39:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x412;
    ExceptionList = &local_10;
    break;
  case 0x3a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xb07;
    iVar1 = 0xb01;
    ExceptionList = &local_10;
    break;
  case 0x3b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xb0b;
    iVar1 = 0xb00;
    ExceptionList = &local_10;
    break;
  case 0x3c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xe00;
    iVar1 = 0xe00;
    ExceptionList = &local_10;
    break;
  case 0x3d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x903;
    ExceptionList = &local_10;
    break;
  case 0x3e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x906;
    ExceptionList = &local_10;
    break;
  case 0x3f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xb04;
    ExceptionList = &local_10;
    break;
  case 0x40:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xb05;
    ExceptionList = &local_10;
    break;
  case 0x41:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xb06;
    ExceptionList = &local_10;
    break;
  case 0x42:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xf05;
    iVar1 = 0xf04;
    ExceptionList = &local_10;
    break;
  case 0x43:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xf07;
    iVar1 = 0xf06;
    ExceptionList = &local_10;
    break;
  case 0x44:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0xf09;
    iVar1 = 0xf08;
    ExceptionList = &local_10;
    break;
  case 0x45:
    iVar5 = 0x1201;
    iVar1 = 0x1200;
    ExceptionList = &local_10;
    break;
  case 0x46:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf0b;
    ExceptionList = &local_10;
    break;
  case 0x47:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf0c;
    ExceptionList = &local_10;
    break;
  case 0x48:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf0d;
    ExceptionList = &local_10;
    break;
  case 0x49:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf0e;
    ExceptionList = &local_10;
    break;
  case 0x4a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf0f;
    ExceptionList = &local_10;
    break;
  case 0x4b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf10;
    ExceptionList = &local_10;
    break;
  case 0x4c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf11;
    ExceptionList = &local_10;
    break;
  case 0x4d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf12;
    ExceptionList = &local_10;
    break;
  case 0x4e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf13;
    ExceptionList = &local_10;
    break;
  case 0x4f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf14;
    ExceptionList = &local_10;
    break;
  case 0x50:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xb03;
    ExceptionList = &local_10;
    break;
  case 0x51:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xb02;
    ExceptionList = &local_10;
    break;
  case 0x52:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x40a;
    ExceptionList = &local_10;
    break;
  case 0x53:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x403;
    ExceptionList = &local_10;
    break;
  case 0x54:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x404;
    ExceptionList = &local_10;
    break;
  case 0x55:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x407;
    ExceptionList = &local_10;
    break;
  case 0x56:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x40e;
    ExceptionList = &local_10;
    break;
  case 0x57:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x409;
    ExceptionList = &local_10;
    break;
  case 0x58:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x413;
    ExceptionList = &local_10;
    break;
  case 0x59:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x414;
    ExceptionList = &local_10;
    break;
  case 0x5a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x419;
    ExceptionList = &local_10;
    break;
  case 0x5b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41b;
    ExceptionList = &local_10;
    break;
  case 0x5c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41c;
    ExceptionList = &local_10;
    break;
  case 0x5d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41d;
    ExceptionList = &local_10;
    break;
  case 0x5e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41e;
    ExceptionList = &local_10;
    break;
  case 0x5f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41f;
    ExceptionList = &local_10;
    break;
  case 0x60:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x422;
    ExceptionList = &local_10;
    break;
  case 0x61:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x40d;
    ExceptionList = &local_10;
    break;
  case 0x62:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc00;
    ExceptionList = &local_10;
    break;
  case 99:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc01;
    ExceptionList = &local_10;
    break;
  case 100:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc02;
    ExceptionList = &local_10;
    break;
  case 0x65:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc05;
    ExceptionList = &local_10;
    break;
  case 0x66:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc08;
    ExceptionList = &local_10;
    break;
  case 0x67:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc0c;
    ExceptionList = &local_10;
    break;
  case 0x68:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xc0b;
    ExceptionList = &local_10;
    break;
  case 0x69:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x704;
    ExceptionList = &local_10;
    break;
  case 0x6a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x705;
    ExceptionList = &local_10;
    break;
  case 0x6b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x706;
    ExceptionList = &local_10;
    break;
  case 0x6c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x707;
    ExceptionList = &local_10;
    break;
  case 0x6d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x708;
    ExceptionList = &local_10;
    break;
  case 0x6e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x709;
    ExceptionList = &local_10;
    break;
  case 0x6f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x900;
    ExceptionList = &local_10;
    break;
  case 0x70:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x901;
    ExceptionList = &local_10;
    break;
  case 0x71:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x902;
    ExceptionList = &local_10;
    break;
  case 0x72:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf16;
    ExceptionList = &local_10;
    break;
  case 0x73:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf17;
    ExceptionList = &local_10;
    break;
  case 0x74:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf18;
    ExceptionList = &local_10;
    break;
  case 0x75:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf19;
    ExceptionList = &local_10;
    break;
  case 0x76:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1a;
    ExceptionList = &local_10;
    break;
  case 0x77:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1b;
    ExceptionList = &local_10;
    break;
  case 0x78:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1c;
    ExceptionList = &local_10;
    break;
  case 0x79:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1d;
    ExceptionList = &local_10;
    break;
  case 0x7a:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1e;
    ExceptionList = &local_10;
    break;
  case 0x7b:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x40b;
    ExceptionList = &local_10;
    break;
  case 0x7c:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x41a;
    ExceptionList = &local_10;
    break;
  case 0x7d:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0x420;
    ExceptionList = &local_10;
    break;
  case 0x7e:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x421;
    iVar1 = iVar5;
    ExceptionList = &local_10;
    break;
  case 0x7f:
    uVar3 = CONCAT31(uVar4,*(char *)(param_1 + 0x35837e));
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar5 = 0x430;
    iVar1 = 0x408;
    ExceptionList = &local_10;
  }
  if (DAT_007c25f4 == 0) {
    ExceptionList = local_10;
    return 1;
  }
  if (param_2 == '\0') {
    local_8 = 2;
    uVar3 = (**(code **)(**(int **)(DAT_007c25f4 + 0x44) + 0x18))
                      (*(undefined4 *)(DAT_007c25f4 + 0x40),iVar1,param_4);
  }
  else {
    if (iVar5 == -1) {
      FUN_005923a0(&DAT_0076f200,(float)iVar1);
    }
    *(undefined4 *)(param_1 + 0x357ecc + *(int *)(param_1 + 0x357ec0) * 0xc) = param_4;
    *(int *)(param_1 + (*(int *)(param_1 + 0x357ec0) + 0x4753b) * 0xc) = iVar1;
    *(int *)(param_1 + 0x357ec8 + *(int *)(param_1 + 0x357ec0) * 0xc) = iVar5;
    if (*(int *)(param_1 + 0x357ec0) == 0) {
      uVar6 = *(undefined4 *)(param_1 + 0x357ecc);
      uVar3 = (uint)*(ushort *)(param_1 + 0x357ec4);
      local_8 = 0;
      (**(code **)(**(int **)(DAT_007c25f4 + 0x44) + 0x18))
                (*(undefined4 *)(DAT_007c25f4 + 0x40),uVar3,uVar6);
      uVar3 = FUN_004b85d7(uVar3,uVar6);
      return uVar3;
    }
    uVar3 = *(int *)(param_1 + 0x357ec0) + 1;
    *(uint *)(param_1 + 0x357ec0) = uVar3;
    if (99 < (int)uVar3) {
      *(undefined4 *)(param_1 + 0x357ec0) = 0;
      uVar3 = FUN_005923a0(s_MAX_QUE____Waiting_0076f1ec,0);
    }
  }
LAB_004b8516:
  ExceptionList = local_10;
  return uVar3 & 0xffffff00;
}


