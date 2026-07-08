
void FUN_004ac4f0(undefined4 *param_1,int param_2,undefined4 param_3)

{
  int *piVar1;
  int *piVar2;
  undefined4 *puVar3;
  int *piVar4;
  undefined4 *puVar5;
  undefined4 *puVar6;
  undefined4 uStack_4;
  
  puVar3 = param_1;
  if (param_2 == 0) {
    FUN_004ac670();
    puVar6 = (undefined4 *)puVar3[9];
    puVar5 = (undefined4 *)*puVar6;
    while (puVar5 != puVar6) {
      if ((code *)puVar5[4] == (code *)0x0) {
        puVar5 = (undefined4 *)FUN_004ab270(&uStack_4,puVar5);
        puVar5 = (undefined4 *)*puVar5;
      }
      else {
        (*(code *)puVar5[4])(puVar5[3],0,0,&DAT_007c1bb8,0xffffffff);
        if (puVar5[4] == 0) {
          param_1 = puVar5;
          piVar4 = (int *)FUN_004fe5e0(&param_2,0);
          piVar4 = (int *)*piVar4;
          *(int *)piVar4[1] = *piVar4;
          *(int *)(*piVar4 + 4) = piVar4[1];
          FUN_004ad080(0);
          FUN_00648d6b(piVar4);
          puVar3[10] = puVar3[10] + -1;
          puVar5 = param_1;
        }
        else {
          puVar5 = (undefined4 *)*puVar5;
        }
      }
    }
    if (*(char *)(puVar3 + 0x2a) != '\0') {
      *(undefined1 *)((int)puVar3 + 0xa9) = 1;
      return;
    }
  }
  else {
    piVar4 = (int *)param_1[9];
    piVar2 = (int *)*piVar4;
    while (piVar2 != piVar4) {
      if ((code *)piVar2[4] == (code *)0x0) {
        puVar6 = (undefined4 *)FUN_004ab270(&param_1,piVar2);
        piVar2 = (int *)*puVar6;
      }
      else {
        (*(code *)piVar2[4])(piVar2[3],4,0,&DAT_007c1bb8,param_3);
        if (piVar2[4] == 0) {
          piVar1 = (int *)*piVar2;
          *(int **)piVar2[1] = piVar1;
          *(int *)(*piVar2 + 4) = piVar2[1];
          FUN_004ad080(0);
          FUN_00648d6b(piVar2);
          puVar3[10] = puVar3[10] + -1;
          piVar2 = piVar1;
        }
        else {
          piVar2 = (int *)*piVar2;
        }
      }
    }
    if (*(char *)(puVar3 + 0x2a) != '\0') {
      *(undefined1 *)((int)puVar3 + 0xa9) = 1;
    }
  }
  return;
}

