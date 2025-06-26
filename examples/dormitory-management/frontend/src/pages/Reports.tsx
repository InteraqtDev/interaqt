/** @jsx createElement */
import { createElement, atom } from 'axii'
import { Card, CardHeader, CardBody } from '../components/ui'
import './Reports.css'

export function Reports() {
  return (
    <div className="reports">
      <div className="page-header">
        <h2>数据报表</h2>
      </div>

      <div className="report-grid">
        <Card>
          <CardHeader>
            <h3>宿舍入住率</h3>
          </CardHeader>
          <CardBody>
            <div className="stat-value">85%</div>
            <p className="stat-desc">当前入住率</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3>平均积分</h3>
          </CardHeader>
          <CardBody>
            <div className="stat-value">78</div>
            <p className="stat-desc">所有成员平均积分</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3>本月申请</h3>
          </CardHeader>
          <CardBody>
            <div className="stat-value">24</div>
            <p className="stat-desc">本月新申请数量</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3>活跃宿舍</h3>
          </CardHeader>
          <CardBody>
            <div className="stat-value">16</div>
            <p className="stat-desc">有成员的宿舍数</p>
          </CardBody>
        </Card>
      </div>

      <Card className="chart-card">
        <CardHeader>
          <h3>趋势图表</h3>
        </CardHeader>
        <CardBody>
          <div className="chart-placeholder">
            <p>图表功能开发中...</p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}