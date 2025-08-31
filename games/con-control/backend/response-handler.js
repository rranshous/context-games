import { executeTool, getAvailableToolDefinitions } from './tool-manager.js';
import { updateGameState, isOxygenDepleted, calculateOxygenRemaining } from './game-state.js';
import { calculateCost, addCostToSession, formatCost, formatTokens } from './cost-calculator.js';

/**
 * Response handler for Claude conversations
 * Manages the conversation flow, tool execution, and streaming responses
 */
export class ResponseHandler {
  constructor(claudeClient, shipFileSystem) {
    this.claudeClient = claudeClient;
    this.shipFileSystem = shipFileSystem;
  }

  /**
   * Handle a complete Claude conversation with tool execution
   * @param {Object} response - Initial Claude response
   * @param {Object} state - Current game state
   * @param {Object} res - Express response object for streaming
   * @param {Object} req - Express request object
   * @param {string} originalMessage - The original user message
   */
  async handleConversation(response, state, res, req, originalMessage) {
    let updatedState = { ...state };
    let conversationMessages = [...updatedState.conversationHistory];
    conversationMessages.push({ role: "user", content: originalMessage });
    
    let currentResponse = response;
    let finalResponseText = '';
    let turnCount = 0;
    const MAX_TURNS = 20;
    
    while (turnCount < MAX_TURNS) {
      turnCount++;
      console.log(`🔄 Processing turn ${turnCount}...`);
      
      // Check for oxygen depletion at the start of each turn
      if (isOxygenDepleted(updatedState)) {
        console.log('💀 Oxygen depleted - Game Over');
        updatedState.gamePhase = 'failed';
        updatedState.objectives.current = 'GAME OVER - Oxygen depleted';
        
        res.write(`data: ${JSON.stringify({ 
          type: 'text', 
          content: '\n🚨 EMERGENCY ALERT: Life support systems have failed. Oxygen levels critical. You have succumbed to hypoxia...\n\n**GAME OVER**\n\nYour escape attempt has failed. The Ship AI systems are shutting down to preserve remaining power for emergency beacon transmission.' 
        })}\n\n`);
        
        return updatedState;
      }
      
      let hasToolCalls = false;
      let toolResults = [];
      let responseText = '';
      
      // Process current response content
      let bufferedToolCalls = []; // Buffer tool calls to send after text
      
      for (const content of currentResponse.content) {
        if (content.type === 'text') {
          responseText += content.text;
        } else if (content.type === 'tool_use') {
          hasToolCalls = true;
          console.log(`🔧 Claude is calling tool: ${content.name}`);
          
          const toolName = content.name;
          const toolInput = content.input || {};
          
          // Buffer tool call info instead of sending immediately
          bufferedToolCalls.push({
            name: toolName,
            input: toolInput,
            contentId: content.id
          });
        }
      }
      
      // Stream any text response to the user FIRST
      if (responseText.trim()) {
        this.streamText(res, responseText);
        finalResponseText += responseText;
      }
      
      // NOW process buffered tool calls AFTER text has been sent
      for (const bufferedTool of bufferedToolCalls) {
        const { name: toolName, input: toolInput, contentId } = bufferedTool;
        
        // Send tool call info to frontend
        res.write(`data: ${JSON.stringify({ 
          type: 'tool_call', 
          name: toolName, 
          input: toolInput 
        })}\n\n`);
        
        // Execute the tool
        const toolResult = executeTool(toolName, updatedState, toolInput, this.shipFileSystem);
        console.log(`⚙️ Tool ${toolName} result:`, toolResult);
        
        // Send tool result to frontend
        res.write(`data: ${JSON.stringify({ 
          type: 'tool_result', 
          name: toolName, 
          result: toolResult 
        })}\n\n`);
        
        // Update game state based on tool result
        updatedState = updateGameState(updatedState, toolName, toolResult, toolInput);
        
        // Check for oxygen depletion after tool execution
        if (isOxygenDepleted(updatedState)) {
          console.log('💀 Oxygen depleted during tool execution - Game Over');
          updatedState.gamePhase = 'failed';
          updatedState.objectives.current = 'GAME OVER - Oxygen depleted';
          
          res.write(`data: ${JSON.stringify({ 
            type: 'text', 
            content: '\n🚨 CRITICAL: Oxygen levels have dropped to zero during system operations. Emergency life support failure...\n\n**GAME OVER**' 
          })}\n\n`);
          
          return updatedState;
        }
        
        // Collect tool result for Claude
        toolResults.push({
          tool_use_id: contentId,
          type: "tool_result",
          content: JSON.stringify(toolResult)
        });
      }
      
      // Add a newline after tool calls to separate from next response
      if (bufferedToolCalls.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: '\n' })}\n\n`);
      }
      
      // Add assistant's response to conversation
      conversationMessages.push({ role: "assistant", content: currentResponse.content });
      
      // If there were tool calls, continue the conversation
      if (hasToolCalls && toolResults.length > 0) {
        console.log(`🔧 Calling Claude again with ${toolResults.length} tool results...`);
        
        // Add tool results as user message
        conversationMessages.push({ role: "user", content: toolResults });
        
        try {
          const availableTools = getAvailableToolDefinitions(updatedState);
          currentResponse = await this.claudeClient.followUpCall(conversationMessages, availableTools, turnCount);
          
          // Track costs from follow-up call
          if (currentResponse.usage) {
            const cost = calculateCost(currentResponse.usage);
            updatedState = addCostToSession(updatedState, cost, false); // Mark as follow-up call
            
            // Send cost update event
            this.sendCostUpdate(res, updatedState.sessionCosts);
          }
          
        } catch (error) {
          console.error('❌ Error in Claude follow-up call:', error);
          res.write(`data: ${JSON.stringify({ type: 'text', content: 'Error processing ship systems response.' })}\n\n`);
          break;
        }
      } else {
        // No more tool calls, conversation is complete
        console.log(`✅ Conversation complete after ${turnCount} turns`);
        break;
      }
    }
    
    if (turnCount >= MAX_TURNS) {
      console.log(`⚠️ Reached maximum turns (${MAX_TURNS}), ending conversation`);
      res.write(`data: ${JSON.stringify({ type: 'system_warning', content: '[Runaway AI Detected - Pausing AI]' })}\n\n`);
    }
    
    // Update conversation history with the complete multi-turn exchange
    // conversationMessages already contains the full conversation including tool calls/results
    // Skip the first message since it's the originalMessage we already added at the start
    updatedState.conversationHistory = conversationMessages;
    
    return updatedState;
  }

  /**
   * Stream text response to the client in chunks
   * @param {Object} res - Express response object
   * @param {string} text - Text to stream
   */
  streamText(res, text) {
    const words = text.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ');
      // Always add a space after each chunk except the very last one
      const finalChunk = (i + 3 < words.length) ? chunk + ' ' : chunk;
      res.write(`data: ${JSON.stringify({ type: 'text', content: finalChunk })}\n\n`);
    }
  }

  /**
   * Send cost update event via SSE
   * @param {Object} res - Express response object
   * @param {Object} sessionCosts - Current session cost data
   */
  sendCostUpdate(res, sessionCosts) {
    const costEvent = {
      type: 'cost_update',
      data: {
        totalCost: sessionCosts.totalCost,
        totalTokens: sessionCosts.totalTokens,
        inputTokens: sessionCosts.inputTokens,
        outputTokens: sessionCosts.outputTokens,
        callCount: sessionCosts.callCount,
        formattedCost: formatCost(sessionCosts.totalCost),
        formattedTokens: formatTokens(sessionCosts.totalTokens)
      }
    };
    
    res.write(`data: ${JSON.stringify(costEvent)}\n\n`);
  }
}
