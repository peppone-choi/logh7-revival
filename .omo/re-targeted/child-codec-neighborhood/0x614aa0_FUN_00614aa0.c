
void FUN_00614aa0(int param_1)

{
  int *piVar1;
  undefined4 *puVar2;
  int *piVar3;
  int *piVar4;
  
  piVar3 = DAT_03350938;
  if (DAT_03350938 != (int *)0x0) {
    if (*DAT_03350938 == param_1) {
      piVar1 = DAT_03350938 + 1;
      puVar2 = (undefined4 *)*DAT_03350938;
      piVar4 = DAT_03350938;
      DAT_03350938 = (int *)*piVar1;
      if (puVar2 != (undefined4 *)0x0) {
        (**(code **)*puVar2)(1);
        FUN_00648d6b(piVar3);
        return;
      }
    }
    else {
      piVar4 = (int *)DAT_03350938[1];
      if ((int *)DAT_03350938[1] == (int *)0x0) {
        return;
      }
      while (*piVar4 != param_1) {
        piVar1 = piVar4 + 1;
        piVar3 = piVar4;
        piVar4 = (int *)*piVar1;
        if ((int *)*piVar1 == (int *)0x0) {
          return;
        }
      }
      piVar3[1] = piVar4[1];
      if ((undefined4 *)*piVar4 != (undefined4 *)0x0) {
        (*(code *)**(undefined4 **)*piVar4)(1);
      }
    }
    FUN_00648d6b(piVar4);
  }
  return;
}

