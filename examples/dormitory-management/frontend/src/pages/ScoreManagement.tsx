/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Button, Card, CardHeader, CardBody } from '../components/ui'
import { ScoreRecord } from '../types'
import { interactionSDK } from '../utils/interactionSDK'
import './ScoreManagement.css'

export function ScoreManagement() {
  const scoreRecords = atom<ScoreRecord[]>([])
  const loading = atom(true)
  const error = atom<string | null>(null)

  const loadData = async () => {
    try {
      loading(true)
      error(null)
      
      const records = await interactionSDK.getScoreRecords()
      scoreRecords(records)
    } catch (err) {
      console.error('Failed to load score records:', err)
      error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      loading(false)
    }
  }

  loadData()

  const renderContent = () => {
    if (loading()) {
      return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      )
    }

    if (error()) {
      return (
        <div className="error-container">
          <div className="error-message">加载失败: {error()}</div>
          <Button onClick={loadData}>重试</Button>
        </div>
      )
    }

    return (
      <div className="score-management">
        <div className="page-header">
          <h2>积分管理</h2>
          <div className="stats">
            总记录: {scoreRecords().length}
          </div>
        </div>

        <div className="score-records">
          {scoreRecords().map(record => (
            <Card className="score-record">
              <CardBody>
                <div className="record-header">
                  <div className="record-info">
                    <h4>{record.member.user.name}</h4>
                    <p className="record-meta">
                      {record.member.dormitory.name} • {new Date(record.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className={`points ${record.points >= 0 ? 'positive' : 'negative'}`}>
                    {record.points > 0 ? '+' : ''}{record.points}
                  </div>
                </div>
                <p className="record-reason">{record.reason}</p>
                <div className="record-footer">
                  <span className="category">{record.category}</span>
                  <span className="recorder">记录者: {record.recorder.name}</span>
                </div>
              </CardBody>
            </Card>
          ))}
          {scoreRecords().length === 0 && (
            <div className="empty-state">暂无积分记录</div>
          )}
        </div>
      </div>
    )
  }

  return renderContent
}