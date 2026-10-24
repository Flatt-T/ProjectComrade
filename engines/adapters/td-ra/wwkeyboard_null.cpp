// COMRADE headless input backend. No host events are synthesized.
#include "wwkeyboard.h"

class WWKeyboardClassNull : public WWKeyboardClass
{
public:
    KeyASCIIType To_ASCII(unsigned short) override { return KA_NONE; }
private:
    void Fill_Buffer_From_System() override {}
};

WWKeyboardClass* CreateWWKeyboardClass()
{
    return new WWKeyboardClassNull();
}
