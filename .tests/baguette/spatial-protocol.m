#import <Foundation/Foundation.h>
#import <simd/simd.h>
#import <sys/file.h>
#import <unistd.h>
#import <signal.h>
#import <poll.h>
#import <dlfcn.h>
#import <math.h>
static volatile sig_atomic_t stopping=0;
enum {Interact,Tilt,Pan,Orbit,Dolly,Move,Reset,Gaze,TwoHands,Pointer};
static int events=0,created=0,removed=0;
static uint32_t mask=0;
static double totalX=0,totalY=0;
@interface MockProcessInfo:NSObject
+(MockProcessInfo*)processInfo;
-(double)systemUptime;
@end
@implementation MockProcessInfo
+(MockProcessInfo*)processInfo{return [self new];}
-(double)systemUptime{static double time=0;time+=30;return time;}
@end
static void hold(double seconds){}
static BOOL sendEvent(id client,void*message){return YES;}
static BOOL cameraPose(id device,simd_float4x4*actual,simd_float4x4*desired){*actual=desired?*desired:matrix_identity_float4x4;return YES;}
static void*cameraMessage(simd_float4x4 pose){return (void*)1;}
static void*manipulator(simd_float4x4 pose,double a,double b,double c,double d,double e,double f,double g,double h,int mode,BOOL down){return (void*)1;}
static simd_float4x4 movedCamera(simd_float4x4 pose,int mode,double dx,double dy,double dz){return pose;}
static BOOL pointerEvent(id client,double dx,double dy,uint32_t buttons,uint32_t previous){
 if(previous!=mask||!isfinite(dx)||!isfinite(dy))abort();
 events++;mask=buttons;totalX+=dx;totalY+=dy;return YES;
}
static void*createMouse(void){created++;return (void*)1;}
static void*removeMouse(void){removed++;return (void*)1;}
static void*fakeSymbol(const char*name){if(strstr(name,"CreateMouse"))return (void*)createMouse;if(strstr(name,"RemoveMouse"))return (void*)removeMouse;return NULL;}
#define NSProcessInfo MockProcessInfo
#define dlopen(...) ((void*)1)
#define dlsym(handle,name) fakeSymbol(name)
// PRODUCTION_STREAM
int main(void){@autoreleasepool{char file[]="/tmp/cindy-native-smoke-XXXXXX";int lock=mkstemp(file);unlink(file);int result=stream(nil,nil,lock);fprintf(stderr,"{\"result\":%d,\"events\":%d,\"mask\":%u,\"dx\":%.3f,\"dy\":%.3f,\"created\":%d,\"removed\":%d}\n",result,events,mask,totalX,totalY,created,removed);return result;}}
