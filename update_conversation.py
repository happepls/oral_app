#!/usr/bin/env python3

with open('/Users/sgcc-work/IdeaProjects/oral_app/client/src/pages/Conversation.js', 'r') as f:
    content = f.read()

old_func = """  const handleRecordingStop = () => {
    console.log('handleRecordingStop called, WebSocket state:', socketRef.current?.readyState);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('Sending user_audio_ended');
        socketRef.current.send(JSON.stringify({ type: 'user_audio_ended' }));
        console.log('user_audio_ended sent, keeping WebSocket open for AI response');
        
        // 设置 AI 响应等待状态，防止过早断开连接
        setIsAISpeaking(true); // 标记 AI 正在准备响应
        
        // 设置超时机制，如果 AI 在 30 秒内没有响应，则标记为完成
        setTimeout(() => {
            if (isAISpeaking) {
                console.log('AI response timeout - marking as complete after 30 seconds');
                setIsAISpeaking(false);
            }
        }, 30000); // 30 秒超时
        
    } else {
        console.error('WebSocket not open when trying to send user_audio_ended, state:', socketRef.current?.readyState);
    }
    isInterruptedRef.current = false;
  };"""

new_func = """  const handleRecordingStop = () => {
    console.log('🎤 handleRecordingStop called, WebSocket state:', socketRef.current?.readyState);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('📤 Sending user_audio_ended');
        socketRef.current.send(JSON.stringify({ type: 'user_audio_ended' }));
        console.log('✅ user_audio_ended sent');
        console.log('🔄 Setting isAISpeaking = true');
        setIsAISpeaking(true);
        console.log('📊 isAISpeaking state after setting:', true);
        setTimeout(() => {
            console.log('⏰ AI response timeout check');
            setIsAISpeaking(false);
        }, 30000);
    } else {
        console.error('❌ WebSocket not open when trying to send user_audio_ended, state:', socketRef.current?.readyState);
    }
    isInterruptedRef.current = false;
  };"""

if old_func in content:
    content = content.replace(old_func, new_func)
    with open('/Users/sgcc-work/IdeaProjects/oral_app/client/src/pages/Conversation.js', 'w') as f:
        f.write(content)
    print("✅ File updated successfully")
else:
    print("❌ Could not find the function to replace")
